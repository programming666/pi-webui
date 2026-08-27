/**
 * pi-webui bridge.
 *
 * Owns the live `ExtensionContext` for the current session and translates
 * browser WebSocket RPC calls into pi extension API calls. The bridge is
 * intentionally thin: it captures ctx from event handlers, exposes a flat
 * method surface to the server, and never blocks the agent loop on I/O.
 *
 * Most operations are available directly via the `ExtensionContext` the
 * runner hands us on every event. A small set (`newSession`, `fork`,
 * `switchSession`, `navigateTree`) only exist on `ExtensionCommandContext`,
 * which is only handed to command handlers. We register a hidden
 * `/webui-setup` command that the user can run once per session to unlock
 * those operations from the WebSocket; until it runs the corresponding RPCs
 * return a "setup not run" error instead of throwing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionCommandContextActions,
	ToolInfo,
	ContextUsage,
	SessionInfoChangedEvent,
} from "@earendil-works/pi-coding-agent";
import type { Model, Api } from "@earendil-works/pi-ai";
import type {
	BrowserRequest,
	BridgeResponse,
	SessionListItem,
	SessionEntrySummary,
	SessionListGroup,
	SessionTreeNodeSummary,
	AgentMessage,
	ModelInfo,
	AskUserQuestionEventPayload,
	AskUserQuestionAnswerPayload,
} from "./types.js";
import { buildNativeSnapshot } from "./context/snapshot.js";
import { computeUsage, toReportedUsage } from "./context/usage.js";

const SESSIONS_DIR = process.env.PI_CODING_AGENT_SESSION_DIR
	? path.resolve(process.env.PI_CODING_AGENT_SESSION_DIR)
	: path.join(
			(process.env.PI_CODING_AGENT_DIR ||
				path.join(process.env.HOME || process.env.USERPROFILE || "~", ".pi", "agent")).replace(
					/^~(?=\/|$)/,
					process.env.HOME || process.env.USERPROFILE || "~",
				),
			"sessions",
		);

const MAX_LISTED_SESSIONS = 200;

type CommandActions = ExtensionCommandContextActions;

/**
 * Per-request bridge state captured from the current extension context.
 *
 * `latestCtx` is refreshed in every event handler. Command-only methods
 * (`newSession`, `fork`, `switchSession`, `navigateTree`) live behind a
 * separate object populated by the `/webui-setup` command handler.
 */
export class PiBridge {
	private latestCtx: ExtensionContext | null = null;
	private commandCtx: Partial<CommandActions> = {};
	private sessionStartReason: string | undefined;
	/** Set by the server module — receives every forwarded pi event. */
	onEvent: ((event: unknown) => void) | null = null;

	/** Connected WebSocket clients (registered by server.ts). Used to push ask_user_question prompts. */
	private wsClients = new Set<{ send: (data: string) => void; readyState: number }>();

	/** Pending ask_user_question tool executions awaiting a browser answer. */
	private pendingAskQuestions = new Map<
		string,
		{ resolve: (r: AskUserQuestionAnswerPayload) => void; reject: (e: Error) => void }
	>();

	/** Cached subscription-usage state from the pi-usage extension (`usage-core:*` events). */
	private subUsage: { provider?: string; usage?: { windows: Array<{ label: string; usedPercent: number; resetDescription?: string }> } } | null = null;
	constructor(private readonly pi: ExtensionAPI) {
		// Mirror PowerBar's sub producer: listen to pi-usage events so the webui
		// can show provider rate-limit usage without re-fetching credentials.
		this.pi.events.on("usage-core:ready", (payload: unknown) => {
			this.subUsage = ((payload as { state?: unknown })?.state ?? null) as typeof this.subUsage;
		});
		this.pi.events.on("usage-core:update-current", (payload: unknown) => {
			this.subUsage = ((payload as { state?: unknown })?.state ?? null) as typeof this.subUsage;
		});
	}
	// ───────────────────────── ctx wiring ─────────────────────────

	/** Called by event handlers so RPCs always have a fresh ctx. */
	setContext(ctx: ExtensionContext, reason?: string): void {
		this.latestCtx = ctx;
		if (reason !== undefined) this.sessionStartReason = reason;
	}

	/** Forget the current ctx (used on session_shutdown so RPCs fail fast). */
	clearContext(): void {
		this.latestCtx = null;
		this.commandCtx = {};
		this.sessionStartReason = undefined;
	}

	/** Populate command-only methods. Called by `/webui-setup`. */
	setCommandContext(ctx: CommandActions): void {
		this.commandCtx = { ...ctx };
	}

	isReady(): boolean {
		return this.latestCtx !== null;
	}

	getSessionStartReason(): string | undefined {
		return this.sessionStartReason;
	}

	// ───────────────────────── ask_user_question ─────────────────────────

	/** Register a connected WebSocket client (called by server.ts on connection). */
	registerWsClient(ws: { send: (data: string) => void; readyState: number }): void {
		this.wsClients.add(ws);
	}

	/** Unregister a WebSocket client (called by server.ts on close). */
	unregisterWsClient(ws: { send: (data: string) => void; readyState: number }): void {
		this.wsClients.delete(ws);
	}

	/** True when at least one browser tab is connected. */
	hasWebClients(): boolean {
		return this.wsClients.size > 0;
	}

	/**
	 * Bridge the ask_user_question tool execution to the browser: push the
	 * questionnaire to every connected tab and wait for one answer. Returns a
	 * promise that resolves with the browser's answer (or rejects when the
	 * tool is aborted / the tab disconnects).
	 */
	askUserQuestion(
		toolCallId: string,
		questions: AskUserQuestionEventPayload["questions"],
		timeoutMs = 10 * 60 * 1000,
	): Promise<AskUserQuestionAnswerPayload> {
		return new Promise((resolve, reject) => {
			this.pendingAskQuestions.set(toolCallId, { resolve, reject });

			const payload: AskUserQuestionEventPayload = { toolCallId, questions };
			const json = JSON.stringify({ type: "event", event: { type: "ask_user_question", ...payload } });
			for (const ws of this.wsClients) {
				if (ws.readyState === 1 /* OPEN */) ws.send(json);
			}

			// Safety timeout so a tool execution can never hang forever if the
			// tab closes mid-questionnaire without a clean close message.
			const timer = setTimeout(() => {
				const pending = this.pendingAskQuestions.get(toolCallId);
				if (pending) {
					this.pendingAskQuestions.delete(toolCallId);
					pending.reject(new Error("ask_user_question timed out waiting for browser answer"));
				}
			}, timeoutMs);
			timer.unref?.();
		});
	}

	/** Called from handleRequest when the browser submits an answer. */
	resolveAskUserQuestion(toolCallId: string, answer: AskUserQuestionAnswerPayload): boolean {
		const pending = this.pendingAskQuestions.get(toolCallId);
		if (!pending) return false;
		this.pendingAskQuestions.delete(toolCallId);
		pending.resolve(answer);
		return true;
	}

	/** Reject + clear every pending questionnaire (e.g. session shutdown). */
	rejectAllAskQuestions(reason: string): void {
		for (const [, pending] of this.pendingAskQuestions) {
			pending.reject(new Error(reason));
		}
		this.pendingAskQuestions.clear();
	}


	// ───────────────────────── read state ─────────────────────────

	/** PowerBar-style statistics: git branch, context usage, token totals, subscription usage. */
	private getPowerbar(ctx: ExtensionContext): Record<string, unknown> {
		return {
			gitBranch: this.getGitBranch(ctx.cwd),
			context: this.getContextUsage(ctx),
			tokens: this.getTokenTotals(ctx),
			sub: this.subUsage ? { provider: this.subUsage.provider, windows: this.subUsage.usage?.windows ?? [] } : null,
		};
	}

	private getGitBranch(cwd: string): string | null {
		try {
			let dir = path.resolve(cwd);
			while (true) {
				const dotGit = path.join(dir, ".git");
				let gitDir: string | null = null;
				try {
					const st = fs.statSync(dotGit);
					if (st.isDirectory()) gitDir = dotGit;
				} catch {
					// maybe a gitfile pointer
					try {
						const pointer = fs.readFileSync(dotGit, "utf8").trim();
						if (pointer.startsWith("gitdir:")) gitDir = path.resolve(dir, pointer.slice(7).trim());
					} catch {
						// not a git repo at this level
					}
				}
				if (gitDir) {
					const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
					if (head.startsWith("ref: refs/heads/")) return head.slice(16);
					return head.slice(0, 8); // detached HEAD
				}
				const parent = path.dirname(dir);
				if (parent === dir) return null;
				dir = parent;
			}
		} catch {
			return null;
		}
	}

	/** Context-window usage as percent, mirroring PowerBar's context-usage segment. */
	private getContextUsage(ctx: ExtensionContext): { pct: number; tokens: number; window: number } | null {
		const usage = ctx.getContextUsage();
		if (!usage || usage.tokens == null || usage.contextWindow <= 0) return null;
		return {
			pct: Math.round((usage.tokens / usage.contextWindow) * 100),
			tokens: usage.tokens,
			window: usage.contextWindow,
		};
	}

	/** Cumulative token stats from session entries, mirroring PowerBar's tokens segment. */
	private getTokenTotals(ctx: ExtensionContext): { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; cacheHitRate?: number } | null {
		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCacheWrite = 0;
		let totalCost = 0;
		let latestCacheHitRate: number | undefined;
		for (const entry of ctx.sessionManager.getEntries()) {
			let usage:
				| { input: number; output: number; cacheRead?: number; cacheWrite?: number; cost: { total: number } }
				| undefined;
			let isAssistant = false;
			if (entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")) {
				usage = entry.message.usage;
				isAssistant = entry.message.role === "assistant";
			} else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
				usage = entry.usage;
			}
			if (usage) {
				const cacheRead = usage.cacheRead ?? 0;
				const cacheWrite = usage.cacheWrite ?? 0;
				totalInput += usage.input;
				totalOutput += usage.output;
				totalCacheRead += cacheRead;
				totalCacheWrite += cacheWrite;
				totalCost += usage.cost.total;
				if (isAssistant) {
					const promptTokens = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
					latestCacheHitRate = promptTokens > 0 ? ((cacheRead / promptTokens) * 100) : undefined;
				}
			}
		}
		if (totalInput === 0 && totalOutput === 0) return null;
		return { input: totalInput, output: totalOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite, cost: totalCost, cacheHitRate: latestCacheHitRate };
	}

	/**
	 * Context view for the WebUI — mirrors pi's TUI `/context`
	 * (usage decomposition + injection breakdown) using the command context
	 * captured by `/webui-setup` (getSystemPrompt/getSystemPromptOptions are
	 * command-context-only). Returns a serializable, text-truncated payload.
	 */
	private async handleContextView(req: BrowserRequest): Promise<BridgeResponse> {
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});
		const ctx = this.latestCtx;
		if (!ctx) return respond(false, undefined, "no live context");
		const command = this.commandCtx as Partial<{
			getSystemPromptOptions: () => import("@earendil-works/pi-coding-agent").BuildSystemPromptOptions;
			waitForIdle: (opts?: { timeoutMs?: number }) => Promise<void>;
		}>;
		try {
			if (command.waitForIdle) await command.waitForIdle({ timeoutMs: 15000 });
			const systemPrompt = (ctx as { getSystemPrompt?: () => string }).getSystemPrompt?.() ?? "";
			const options = command.getSystemPromptOptions?.() ?? { cwd: process.cwd() };
			const allTools = this.pi.getAllTools();
			const activeToolNames = this.pi.getActiveTools();
			const entries = ctx.sessionManager.getEntries();
			const leafId = (ctx.sessionManager as { getLeafId?: () => string | null }).getLeafId?.() ?? null;
			const session = buildSessionContext(entries, leafId ?? undefined);

			const snapshot = buildNativeSnapshot({
				systemPrompt,
				options,
				allTools,
				activeToolNames,
			});
			const usage = computeUsage({
				snapshot,
				messages: session.messages,
				reported: toReportedUsage(ctx.getContextUsage() as import("@earendil-works/pi-coding-agent").ContextUsage),
				modelLabel: ctx.model?.id ?? "unknown",
				computedAt: new Date(),
			});

			return respond(true, {
				snapshot: {
					items: snapshot.groups.map((group) => ({
						id: `group:${group.source.id}`,
						kind: "context-file",
						source: { id: group.source.id, label: group.source.label, native: group.source.native },
						label: group.source.label,
						chars: group.items.reduce((sum, item) => sum + item.chars, 0),
						tokens: group.items.reduce((sum, item) => sum + item.tokens, 0),
						children: group.items.map((item) => ({
							id: item.id,
							kind: item.kind,
							source: { id: item.source.id, label: item.source.label, native: item.source.native },
							label: item.label,
							chars: item.chars,
							tokens: item.tokens,
							text: truncateText(item.text, 4000),
							children: item.children?.map((child) => ({
								id: child.id,
								kind: child.kind,
								source: { id: child.source.id, label: child.source.label, native: child.source.native },
								label: child.label,
								chars: child.chars,
								tokens: child.tokens,
								text: truncateText(child.text, 4000),
							})),
						})),
					})),
					computedAt: new Date().toISOString(),
				},
				usage: {
					estimatedTokens: usage.estimatedTokens,
					reported: usage.reported ?? undefined,
					categories: usage.categories.map((category) => ({
						label: category.label,
						tokens: category.tokens,
						entries: (category.entries ?? []).map((entry) => ({
							tokens: entry.tokens,
							label: entry.breadcrumb.join(" / ") || "entry",
							kind: entry.breadcrumb[0] ?? "entry",
							truncatedText: truncateText(entry.text ?? "", 600),
						})),
						children: category.children?.map((child) => ({
							label: child.label,
							tokens: child.tokens,
							entries: child.entries?.map((entry) => ({
								tokens: entry.tokens,
								label: entry.breadcrumb.join(" / ") || "entry",
								kind: entry.breadcrumb[0] ?? "entry",
								truncatedText: truncateText(entry.text ?? "", 600),
							})),
						})),
					}))
					.filter((category) => category.tokens > 0),
				},
				modelLabel: ctx.model?.id ?? "unknown",
			});
		} catch (error) {
			return respond(false, undefined, error instanceof Error ? error.message : String(error));
		}
	}
	getSnapshot(): Omit<import("./types.js").SnapshotMessage, "type" | "serverVersion"> | null {
		const ctx = this.latestCtx;
		if (!ctx) return null;
		const usage = ctx.getContextUsage();
		return {
			bridgeReady: true,
			setupDone: Object.keys(this.commandCtx).length > 0,
			startReason: this.sessionStartReason,
			cwd: ctx.cwd,
			mode: ctx.mode,
			isIdle: ctx.isIdle(),
			sessionId: ctx.sessionManager.getSessionId(),
			sessionFile: ctx.sessionManager.getSessionFile(),
			sessionDir: ctx.sessionManager.getSessionDir(),
			sessionName: this.pi.getSessionName(),
			model: this.serializeModel(ctx.model),
			scopedModels: ctx.scopedModels
				.map((s) => this.serializeModel(s.model))
				.filter((m): m is ModelInfo => m !== null),
			thinkingLevel: this.pi.getThinkingLevel(),
			activeTools: this.pi.getActiveTools(),
			allTools: this.pi.getAllTools().map((t) => this.serializeTool(t)),
			commands: this.pi.getCommands().map((c) => ({
				name: c.name,
				description: c.description,
				source: c.source,
			})),
			leafId: (ctx.sessionManager as any).getLeafId?.() ?? null,
			tree: ctx.sessionManager.getTree?.().map((node) => ({
				id: node.entry.id,
				parentId: node.entry.parentId,
				type: node.entry.type,
				label: ctx.sessionManager.getLabel?.(node.entry.id) ?? node.entry.id,
				timestamp: node.entry.timestamp,
				isFork: node.children.length > 1,
				preview: this.previewEntry(node.entry),
				children: [],
			})) ?? [],
			entries: this.getEntries(),
			messages: this.getMessages({ limit: 200 }),
			powerbar: this.getPowerbar(ctx),
		};
	}

	getEntries(): SessionEntrySummary[] {
		const ctx = this.latestCtx;
		if (!ctx) return [];
		const branch = ctx.sessionManager.getBranch();
		return branch.map((e) => this.serializeEntry(e));
	}
/** Pass-through for the REST `/messages` endpoint. Extracts AgentMessages from the session branch. */
	getMessages(opts?: { before?: number; limit?: number; includeEmpty?: boolean }): unknown[] {
		const ctx = this.latestCtx;
		if (!ctx) return [];
		const branch = ctx.sessionManager.getBranch();
		const messages: unknown[] = [];
		for (const entry of branch) {
			if (entry.type === "message") {
				const msg = entry.message as { role?: string; content?: unknown };
				// By default, drop empty assistant messages (they only carry tool calls, no user-visible text).
				if (!opts?.includeEmpty && msg?.role === "assistant" && !hasUserText(msg)) continue;
				// Inject the entry.id so the client can page with it as the `before` cursor.
				messages.push({ ...msg, id: entry.id });
			}
		}
		if (opts?.before != null) {
			const idx = messages.findIndex((m) => (m as { id?: string }).id === opts.before);
			if (idx >= 0) return messages.slice(Math.max(0, idx - (opts.limit ?? 50)), idx);
			return messages.slice(-(opts.limit ?? 50));
		}
		if (opts?.limit != null && messages.length > opts.limit) {
			return messages.slice(messages.length - opts.limit);
		}
		return messages;
	}
	getFullHistory(): SessionEntrySummary[] {
		const ctx = this.latestCtx;
		if (!ctx) return [];
		return ctx.sessionManager.getEntries().map((e) => this.serializeEntry(e));
	}

	getTree(): SessionTreeNodeSummary[] {
		const ctx = this.latestCtx;
		if (!ctx) return [];
		return ctx.sessionManager.getTree().map((node) => ({
			id: node.entry.id,
			parentId: node.entry.parentId,
			type: node.entry.type,
			preview: this.previewEntry(node.entry),
			label: ctx.sessionManager.getLabel(node.entry.id),
			children: node.children.map((c) => c.entry.id),
		}));
	}

	async getAvailableModels(): Promise<ModelInfo[]> {
		const ctx = this.latestCtx;
		if (!ctx) return [];
		// `getAvailable()` requires models.json to be loaded; refresh first to be safe.
		try {
			await ctx.modelRegistry.refresh();
		} catch {
			// refresh failures are non-fatal — the registry may already be loaded.
		}
		const models = ctx.modelRegistry.getAvailable();
		return models.map((m) => this.serializeModel(m)).filter((m): m is ModelInfo => m !== null);
	}

	// ───────────────────────── command dispatch ─────────────────────────

	async handleRequest(req: BrowserRequest): Promise<BridgeResponse> {
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});

		if (!this.latestCtx) {
			return respond(false, undefined, "Extension context not initialized yet");
		}

		try {
			switch (req.action) {
				// ── sync ──
				// `get_state` is the canonical name; `get_snapshot` is an alias.
				case "get_state":
				case "get_snapshot":
					return respond(true, this.getSnapshot());
				case "get_entries":
					return respond(true, this.getEntries());
				case "get_history":
					return respond(true, this.getFullHistory());
				case "get_tree":
					return respond(true, this.getTree());
				case "get_messages":
					const payload = req.payload ?? {};
					return respond(true, this.getMessages(payload.before != null ? { before: payload.before as number, limit: (payload.limit as number) ?? 60 } : { limit: (payload.limit as number) ?? 60 }));
				// `get_available_tools` is the canonical name; `get_available_models` is an alias.
				case "get_available_tools":
				case "get_available_models":
					return respond(true, await this.getAvailableModels());

				// ── sessions on disk ──
				case "list_sessions":
					return respond(true, await this.listSessionsOnDisk());
				case "list_files":
					return respond(true, await this.listFiles(req.payload?.path as string | undefined));

				// ── send / abort ──
				// `prompt` is the canonical name; `send_message` is an alias.
				case "prompt":
				case "send_message":
					return await this.handleSendMessage(req);
				case "steer":
					return await this.handleSendMessage({
						...req,
						payload: { ...req.payload, streamingBehavior: "steer" },
					});
				case "follow_up":
					return await this.handleSendMessage({
						...req,
						payload: { ...req.payload, streamingBehavior: "followUp" },
					});
				case "abort":
					this.latestCtx.abort();
					return respond(true);
				case "shutdown":
					this.latestCtx.shutdown();
					return respond(true);

				// ── ask_user_question ──
				case "ask_user_question_answer": {
					const aq = req.payload ?? {};
					const toolCallId = String(aq.toolCallId ?? "");
					const answers = Array.isArray(aq.answers) ? (aq.answers as string[]) : [];
					const cancelled = Boolean(aq.cancelled);
					const ok = this.resolveAskUserQuestion(toolCallId, { toolCallId, answers, cancelled });
					return respond(ok, { resolved: ok });
				}

				// ── editor ──
				case "set_editor_text":
					this.latestCtx.ui.setEditorText((req.payload?.text as string) ?? "");
					return respond(true);
				case "paste_to_editor":
					this.latestCtx.ui.pasteToEditor((req.payload?.text as string) ?? "");
					return respond(true);
				case "get_editor_text":
					return respond(true, { text: this.latestCtx.ui.getEditorText() });

				// ── model / thinking ──
				case "set_model":
					return await this.handleSetModel(req);
				case "set_thinking_level":
					this.pi.setThinkingLevel(req.payload?.level as never);
					return respond(true, { level: this.pi.getThinkingLevel() });

				// ── tools ──
				case "set_active_tools":
					this.pi.setActiveTools((req.payload?.names as string[]) ?? []);
					return respond(true, { activeTools: this.pi.getActiveTools() });

				// ── session metadata ──
				case "set_session_name":
					this.pi.setSessionName((req.payload?.name as string) ?? "");
					return respond(true);
				case "set_label":
					this.pi.setLabel(
						(req.payload?.entryId as string) ?? "",
						(req.payload?.label as string | undefined) ?? undefined,
					);
					return respond(true);

				// ── compaction ──
				case "compact":
					this.latestCtx.compact(
						req.payload?.customInstructions
							? { customInstructions: req.payload.customInstructions as string }
							: undefined,
					);
					return respond(true);

				// ── notification passthrough (handy for tests) ──
				case "notify":
					this.latestCtx.ui.notify(
						(req.payload?.message as string) ?? "",
						(req.payload?.type as "info" | "warning" | "error") ?? "info",
					);
					return respond(true);

				// ── exec ──
				case "exec": {
					const result = await this.pi.exec(
						(req.payload?.command as string) ?? "",
						(req.payload?.args as string[]) ?? [],
						req.payload?.options as never,
					);
					return respond(true, result);
				}

				// ── context view (mirrors TUI `/context`) ──
				case "context_view":
					return await this.handleContextView(req);

				// ── command-context-only ops ──
				case "new_session":
					return await this.handleNewSession(req);
				case "fork":
					return await this.handleFork(req);
				case "switch_session":
					return await this.handleSwitchSession(req);
				case "navigate_tree":
					return await this.handleNavigateTree(req);
				case "reload":
					if (!this.commandCtx.reload) {
						return respond(false, undefined, "Run /webui-setup to enable session ops");
					}
					await this.commandCtx.reload();
					return respond(true);

				default:
					return respond(false, undefined, `Unknown action: ${(req as { action: string }).action}`);
			}
		} catch (err) {
			return respond(false, undefined, err instanceof Error ? err.message : String(err));
		}
	}

	private async handleSendMessage(req: BrowserRequest): Promise<BridgeResponse> {
		const ctx = this.latestCtx!;
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});

		const message = ((req.payload?.message as string) ?? "").toString();
		const images = Array.isArray(req.payload?.images)
			? (req.payload.images as Array<{ data: string; mimeType: string }>)
			: [];
		const streamingBehavior = req.payload?.streamingBehavior as "steer" | "followUp" | undefined;
		const isSlash = message.startsWith("/");

		if (!message && images.length === 0) {
			return respond(false, undefined, "Empty message");
		}

		const buildContent = (): string
			| Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> => {
			if (images.length === 0) return message;
			const validMimes = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
			const content: Array<
				{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
			> = [{ type: "text", text: message || "(see attached image)" }];
			for (const img of images) {
				const mimeType = (validMimes.find((m) => m === img.mimeType) ?? "image/png") as
					| "image/png"
					| "image/jpeg"
					| "image/gif"
					| "image/webp";
				const data = img.data.includes(",") ? img.data.split(",")[1]! : img.data;
				content.push({ type: "image", data, mimeType });
			}
			return content;
		};

		const isIdle = ctx.isIdle();
		const content = buildContent();

		// Signal pi to route slash-prefixed text to the extension command handler
		// (the same path the TUI uses). Without this, `/mcp` is sent to the model as
		// a literal message instead of being executed as a pi command.
		const sendOpts = isSlash ? { expandPromptTemplates: true } : {};

		if (!isIdle) {
			// Agent is streaming: only allow steer / followUp delivery.
			if (streamingBehavior === "followUp") {
				this.pi.sendUserMessage(content, { deliverAs: "followUp", ...sendOpts });
				return respond(true, { deliveredAs: "followUp" });
			}
			// Default to steer when streaming (matches kkkiio semantics).
			this.pi.sendUserMessage(content, { deliverAs: "steer", ...sendOpts });
			return respond(true, { deliveredAs: "steer" });
		}

		// Must pass triggerTurn:true — in idle (non-streaming) state pi 0.84+ only
		// appends the message and skips the agent unless triggerTurn is explicit.
		this.pi.sendUserMessage(content, { triggerTurn: true, ...sendOpts } as any);
		return respond(true, { deliveredAs: "immediate" });
	}

	private async handleSetModel(req: BrowserRequest): Promise<BridgeResponse> {
		const ctx = this.latestCtx!;
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});

		const provider = req.payload?.provider as string | undefined;
		const modelId = req.payload?.modelId as string | undefined;
		if (!provider || !modelId) {
			return respond(false, undefined, "Missing provider or modelId");
		}
		const model = ctx.modelRegistry.find(provider, modelId);
		if (!model) {
			return respond(false, undefined, `Model not found: ${provider}/${modelId}`);
		}
		const ok = await this.pi.setModel(model);
		if (!ok) return respond(false, undefined, `No API key for ${provider}/${modelId}`);
		return respond(true, { model: this.serializeModel(model) });
	}

	private async handleNewSession(req: BrowserRequest): Promise<BridgeResponse> {
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});
		if (!this.commandCtx.newSession) {
			return respond(false, undefined, "Run /webui-setup to enable new_session");
		}
		const parentSession = req.payload?.parentSession as string | undefined;
		const result = await this.commandCtx.newSession(parentSession ? { parentSession } : undefined);
		return respond(!result.cancelled, result);
	}

	private async handleFork(req: BrowserRequest): Promise<BridgeResponse> {
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});
		if (!this.commandCtx.fork) {
			return respond(false, undefined, "Run /webui-setup to enable fork");
		}
		const entryId = req.payload?.entryId as string | undefined;
		const position = req.payload?.position as "before" | "at" | undefined;
		if (!entryId) return respond(false, undefined, "Missing entryId");
		const result = await this.commandCtx.fork(entryId, position ? { position } : undefined);
		return respond(!result.cancelled, result);
	}

	private async handleSwitchSession(req: BrowserRequest): Promise<BridgeResponse> {
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});
		if (!this.commandCtx.switchSession) {
			return respond(false, undefined, "Run /webui-setup to enable switch_session");
		}
		const path_ = req.payload?.path as string | undefined;
		if (!path_) return respond(false, undefined, "Missing path");
		const result = await this.commandCtx.switchSession(path_);
		return respond(!result.cancelled, result);
	}

	private async handleNavigateTree(req: BrowserRequest): Promise<BridgeResponse> {
		const respond = (success: boolean, data?: unknown, error?: string): BridgeResponse => ({
			type: "response",
			id: req.id,
			success,
			data,
			error,
		});
		if (!this.commandCtx.navigateTree) {
			return respond(false, undefined, "Run /webui-setup to enable navigate_tree");
		}
		const ctx = this.latestCtx!;
		const targetId = req.payload?.entryId as string | undefined;
		if (!targetId) return respond(false, undefined, "Missing entryId");
		if (!ctx.isIdle()) return respond(false, undefined, "Agent is busy");
		if (!ctx.model) return respond(false, undefined, "No model selected");

		const options: Parameters<CommandActions["navigateTree"]>[1] = {};
		const customInstructions = req.payload?.customInstructions as string | undefined;
		if (customInstructions) options.customInstructions = customInstructions;
		if (req.payload?.replaceInstructions) options.replaceInstructions = true;
		const label = req.payload?.label as string | undefined;
		if (label) options.label = label;
		if (req.payload?.summarize !== false) options.summarize = true;

		const result = await this.commandCtx.navigateTree(targetId, options);
		return respond(!result.cancelled, result);
	}

	// ───────────────────────── on-disk session listing ─────────────────────────

	private async listSessionsOnDisk(): Promise<SessionListGroup[]> {
		// Lazy import to keep module load fast on the hot path.
		const fs = await import("node:fs/promises");
		let rootExists = true;
		try {
			await fs.access(SESSIONS_DIR);
		} catch {
			rootExists = false;
		}
		if (!rootExists) return [];

		const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
		const groups: SessionListGroup[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const dirPath = path.join(SESSIONS_DIR, entry.name);
			let files: string[];
			try {
				files = (await fs.readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
			} catch {
				continue;
			}
			const sessions: SessionListItem[] = [];
			for (const file of files.slice(0, MAX_LISTED_SESSIONS)) {
				const filePath = path.join(dirPath, file);
				const item = await this.parseSessionFile(filePath, file);
				if (item) sessions.push(item);
			}
			if (sessions.length === 0) continue;
			sessions.sort((a, b) => b.mtime - a.mtime);
			groups.push({ path: dirPath, dirName: entry.name, sessions });
		}
		groups.sort((a, b) => a.dirName.localeCompare(b.dirName));
		return groups;
	}

	private async parseSessionFile(filePath: string, fileName: string): Promise<SessionListItem | null> {
		const fs = await import("node:fs/promises");
		let stat;
		try {
			stat = await fs.stat(filePath);
		} catch {
			return null;
		}
		let head = "";
		try {
			const fh = await fs.open(filePath, "r");
			try {
				const buf = Buffer.alloc(Math.min(stat.size, 64 * 1024));
				await fh.read(buf, 0, buf.length, 0);
				head = buf.toString("utf-8");
			} finally {
				await fh.close();
			}
		} catch {
			return null;
		}
		const lines = head.split("\n");
		let id = fileName.replace(/\.jsonl$/, "");
		let timestamp = stat.mtime.toISOString();
		let name: string | null = null;
		let firstMessage: string | null = null;
		let cwd: string | null = null;
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const obj = JSON.parse(line) as Record<string, unknown>;
				if (obj.type === "session") {
					if (typeof obj.id === "string") id = obj.id;
					if (typeof obj.timestamp === "string") timestamp = obj.timestamp;
					if (typeof obj.cwd === "string") cwd = obj.cwd;
				} else if (obj.type === "session_info" && typeof obj.name === "string") {
					name = obj.name;
				} else if (obj.type === "message" && firstMessage === null) {
					const msg = obj.message as { role?: string; content?: unknown } | undefined;
					if (msg?.role === "user") {
						const content = msg.content;
						if (typeof content === "string") firstMessage = content;
						else if (Array.isArray(content)) {
							const tb = content.find(
								(b): b is { type: string; text: string } =>
									typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text",
							);
							if (tb) firstMessage = tb.text;
						}
					}
				}
			} catch {
				// ignore malformed line
			}
		}
		return {
			id,
			timestamp,
			name,
			firstMessage: firstMessage?.slice(0, 200) ?? null,
			cwd,
			file: fileName,
			filePath,
			mtime: stat.mtimeMs,
		};
	}

	private async listFiles(reqPath?: string): Promise<{
		entries: { name: string; path: string; isDirectory: boolean; size: number; mtime: number }[];
	}> {
		const fs = await import("node:fs/promises");
		const ctx = this.latestCtx;
		const baseDir = ctx?.cwd ?? process.cwd();
		const target = reqPath ? path.resolve(baseDir, reqPath) : baseDir;
		if (!target.startsWith(baseDir)) {
			return { entries: [] }; // block directory traversal
		}
		let stat;
		try {
			stat = await fs.stat(target);
		} catch {
			return { entries: [] };
		}
		if (!stat.isDirectory()) return { entries: [] };
		const dirEntries = await fs.readdir(target, { withFileTypes: true });
		const out: { name: string; path: string; isDirectory: boolean; size: number; mtime: number }[] = [];
		for (const d of dirEntries) {
			if (d.name.startsWith(".")) continue;
			const p = path.join(target, d.name);
			let s;
			try {
				s = await fs.stat(p);
			} catch {
				continue;
			}
			out.push({
				name: d.name,
				path: p,
				isDirectory: d.isDirectory(),
				size: s.size,
				mtime: s.mtimeMs,
			});
		}
		out.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		return { entries: out };
	}

	// ───────────────────────── serializers ─────────────────────────

	private serializeModel(model: Model<Api> | undefined): ModelInfo | null {
		if (!model) return null;
		return {
			provider: model.provider,
			id: model.id,
			name: model.name,
			api: model.api,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
			reasoning: Boolean(model.reasoning),
			input: Array.isArray(model.input) ? [...model.input] : [],
		};
	}

	private serializeTool(tool: ToolInfo): { name: string; description: string } {
		return {
			name: tool.name,
			description: tool.description,
		};
	}

	private serializeUsage(usage: ContextUsage): ContextUsage {
		return {
			tokens: usage.tokens,
			contextWindow: usage.contextWindow,
			percent: usage.percent,
		};
	}

	private serializeEntry(entry: {
		type: string;
		id: string;
		timestamp: string;
		parentId: string | null;
	}): SessionEntrySummary {
		const ctx = this.latestCtx;
		const label = ctx ? ctx.sessionManager.getLabel(entry.id) : undefined;
		const preview = this.previewEntry(entry);
		const base = { id: entry.id, parentId: entry.parentId, timestamp: entry.timestamp, label, preview };
		switch (entry.type) {
			case "message": {
				const msg = (entry as { message?: AgentMessage }).message;
				return {
					...base,
					type: "message",
					role: msg?.role,
					contentPreview: this.previewContent(msg?.content),
				};
			}
			case "compaction":
				return { ...base, type: "compaction", summary: (entry as { summary?: string }).summary?.slice(0, 200) };
			case "branch_summary":
				return { ...base, type: "branch_summary", fromId: (entry as { fromId?: string }).fromId };
			case "model_change":
				return {
					...base,
					type: "model_change",
					provider: (entry as { provider?: string }).provider,
					modelId: (entry as { modelId?: string }).modelId,
				};
			case "thinking_level_change":
				return {
					...base,
					type: "thinking_level_change",
					level: (entry as { thinkingLevel?: string }).thinkingLevel,
				};
			case "session_info":
				return { ...base, type: "session_info", name: (entry as { name?: string }).name };
			case "label":
				return {
					...base,
					type: "label",
					targetId: (entry as { targetId?: string }).targetId,
					label: (entry as { label?: string }).label,
				};
			default:
				return { ...base, type: entry.type as SessionEntrySummary["type"] };
		}
	}

	private previewEntry(entry: { type: string }): string {
		switch (entry.type) {
			case "message": {
				const msg = (entry as { message?: AgentMessage }).message;
				return this.previewContent(msg?.content);
			}
			case "compaction":
				return "↺ compaction";
			case "branch_summary":
				return "⌥ branch summary";
			case "model_change": {
				const e = entry as { provider?: string; modelId?: string };
				return `model: ${e.provider}/${e.modelId}`;
			}
			case "thinking_level_change":
				return `thinking: ${(entry as { thinkingLevel?: string }).thinkingLevel}`;
			case "session_info":
				return `name: ${(entry as { name?: string }).name ?? "(unset)"}`;
			case "label":
				return `label: ${(entry as { label?: string }).label ?? "(cleared)"}`;
			default:
				return entry.type;
		}
	}

	private previewContent(content: unknown): string {
		if (typeof content === "string") return content.slice(0, 280);
		if (Array.isArray(content)) {
			const textParts: string[] = [];
			for (const block of content) {
				if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
					textParts.push(String((block as { text?: unknown }).text ?? ""));
				}
			}
			return textParts.join(" ").slice(0, 280);
		}
		return "";
	}
}

// Re-export type for callers that want the full bridge command surface.
export type BridgeCommandContext = Partial<CommandActions>;

/**
 * Helper used by index.ts to inform the bridge when a `session_info_changed`
 * event arrives (used to push setup-done updates without a snapshot rebuild).
 */
export function describeInfoChanged(event: SessionInfoChangedEvent): { name?: string } {
	return { name: event.name };
}

/** True if an AgentMessage has at least one user-visible text part (TextContent with non-empty text). */
function hasUserText(msg: { content?: unknown }): boolean {
	const c = msg?.content;
	if (typeof c === "string") return c.trim().length > 0;
	if (Array.isArray(c)) {
		for (const p of c) {
			if (p && typeof p === "object" && (p as { type?: string }).type === "text") {
				const t = (p as { text?: unknown }).text;
				if (typeof t === "string" && t.trim().length > 0) return true;
			}
		}
	}
	return false;
}

/** Truncate preview text for WebUI transport. */
function truncateText(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + "... (+" + (text.length - max) + " more chars)";
}
