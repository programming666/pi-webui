/**
 * pi-webui extension entrypoint.
 *
 * Wires three pieces together:
 *   1. The PiBridge — captures `ExtensionContext` from event handlers and
 *      exposes the RPC surface used by the WebSocket server.
 *   2. The WebSocket + HTTP server — bound to 127.0.0.1 by default and
 *      registered as a `webui` status indicator in the TUI.
 *   3. A small set of `/webui-*` commands — the only command-context
 *      surface we expose. `/webui-setup` unlocks session control from the
 *      browser; `/webui-stop`, `/webui-start`, and `/webui-status` are
 *      operator conveniences.
 *
 * Configuration via env vars or `~/.pi/agent/settings.json`:
*   PI_WEBUI_PORT (default 9777)
 *   PI_WEBUI_HOST (default 127.0.0.1)
 *   PI_WEBUI_DISABLED=1 to skip auto-start
 *   PI_WEBUI_WS_PATH (default /ws)
 *   PI_WEBUI_AUTO_SETUP=1 to call setCommandContext automatically on /webui-setup
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { PiBridge } from "./bridge.js";
import { startServer, type RunningServer } from "./server.js";
import type { PiExtensionEvent, AskUserQuestionEventPayload, AskUserQuestionAnswerPayload } from "./types.js";
import { Type } from "typebox";

interface WebuiSettings {
	port?: number;
	host?: string;
	wsPath?: string;
	disabled?: boolean;
	autoSetup?: boolean;
}

const DEFAULT_PORT = 9777;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_WS_PATH = "/ws";

function loadSettings(): WebuiSettings {
	const env = (key: string): string | undefined => process.env[key];
	const envPort = env("PI_WEBUI_PORT");
	const envHost = env("PI_WEBUI_HOST");
	const envPath = env("PI_WEBUI_WS_PATH");
	const disabled = env("PI_WEBUI_DISABLED") === "1" || env("PI_WEBUI_DISABLED") === "true";
	const autoSetup = env("PI_WEBUI_AUTO_SETUP") === "1";

	let file: Partial<WebuiSettings> = {};
	try {
		const agentDir =
			env("PI_CODING_AGENT_DIR") ||
			path.join(process.env.HOME || process.env.USERPROFILE || "~", ".pi", "agent");
		const settingsPath = path.join(agentDir, "settings.json");
		if (fs.existsSync(settingsPath)) {
			const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
			const candidate = (raw["pi-webui"] || raw["pi_webui"] || raw["piWebui"]) as WebuiSettings | undefined;
			if (candidate && typeof candidate === "object") {
				file = candidate;
			}
		}
	} catch {
		// settings file is optional
	}

	const port = envPort ? parseInt(envPort, 10) : file.port ?? DEFAULT_PORT;
	const host = envHost ?? file.host ?? DEFAULT_HOST;
	const wsPath = envPath ?? file.wsPath ?? DEFAULT_WS_PATH;
	const merged: WebuiSettings = {
		port: Number.isFinite(port) ? port : DEFAULT_PORT,
		host,
		wsPath,
		disabled: disabled || file.disabled === true,
		autoSetup: autoSetup || file.autoSetup === true,
	};
	return merged;
}

export default function (pi: ExtensionAPI): void {
	const settings = loadSettings();
	const bridge = new PiBridge(pi);
	let server: RunningServer | null = null;
	let autoSetupDone = false;

	// The bridge calls this when the runner hands us an event. We translate
	// the raw event object into our wire envelope and dispatch it to the
	// server. Doing this in one place keeps event-type plumbing local.
	const dispatchEvent = (rawEvent: unknown, eventType: string): void => {
const handler = bridge.onEvent;
if (!handler) return;
const payload: Record<string, unknown> = {};
if (rawEvent && typeof rawEvent === "object") {
			for (const [k, v] of Object.entries(rawEvent as Record<string, unknown>)) {
				payload[k] = v;
			}
		}
		handler({ type: eventType as PiExtensionEvent["type"], ...payload });
	};

	// The list of lifecycle events we forward. The runner calls `pi.on()` for
	// each, so the bridge always has a fresh `latestCtx`.
	const eventNames = [
		"session_start",
		"session_info_changed",
		"session_shutdown",
		"session_tree",
		"agent_start",
		"agent_end",
		"agent_settled",
		"turn_start",
		"turn_end",
		"message_start",
		"message_update",
		"message_end",
		"tool_execution_start",
		"tool_execution_update",
		"tool_execution_end",
		"model_select",
		"thinking_level_select",
		"session_compact",
		"session_compact_failed",

	] as const;

for (const name of eventNames) {
pi.on(name as never, async (event: unknown, ctx: ExtensionContext) => {
			// Capture ctx so RPCs always see the latest one.
			if (name === "session_start") {
				const reason = (event as { reason?: string } | undefined)?.reason;
				bridge.setContext(ctx, reason);
				if (autoSetupDone && settings.autoSetup === false) {
					// no-op: keep explicit setup model
				}
			} else {
				bridge.setContext(ctx);
			}
			dispatchEvent(event, name);
		});
	}

	// ─────────── commands ───────────


	// ─────────── ask_user_question tool ───────────
	// Replaces the rpiv-ask-user-question registration (loaded earlier in
	// settings.json): the webui is the questionnaire surface. When no browser
	// tab is connected the execution fails fast with a clear message instead
	// of hanging.
	const OptionSchema = Type.Object({
		label: Type.String({
			maxLength: 60,
			description: "MAX 60 CHARACTERS - hard limit. The display text for this option. Should be concise (1-5 words).",
		}),
		description: Type.String({
			description: "Explanation of what this option means or what will happen if chosen.",
		}),
		preview: Type.Optional(Type.String({ description: "Optional preview content rendered when this option is focused." })),
	});
	const QuestionSchema = Type.Object({
		question: Type.String({
			description:
				'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly.',
		}),
		header: Type.String({
			maxLength: 16,
			description: "MAX 16 CHARACTERS - hard limit. Very short chip/tag shown next to the question. Examples: 'Auth method', 'Library', 'Approach'.",
		}),
		options: Type.Array(OptionSchema, {
			minItems: 2,
			maxItems: 4,
			description:
				"The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). The 'Type something.' row is appended automatically - do NOT author it.",
		}),
		multiSelect: Type.Optional(Type.Boolean({ default: false, description: "Set to true to allow the user to select multiple options instead of just one." })),
	});
	const QuestionParamsSchema = Type.Object({
		questions: Type.Array(QuestionSchema, {
			minItems: 1,
			maxItems: 4,
			description: "Questions to ask the user (1-4 questions)",
		}),
	});

	pi.registerTool({
		name: "ask_user_question",		label: "Ask User Question",
		description:
			"Ask the user a structured multiple-choice question. Use this when you need a concrete decision, a preference, or a choice from the user before continuing. The webui renders the questionnaire and returns the answer.",
		promptSnippet: "Ask the user a structured multiple-choice question when you need a decision before continuing.",
		promptGuidelines: [
			"Ask questions only when you truly need user input - prefer making reasonable assumptions and stating them when you can proceed.",
			"Provide 2-4 distinct, mutually exclusive options per question.",
			"Never author an 'Other' or 'Type something.' option yourself - the runtime appends them automatically.",
		],
		parameters: QuestionParamsSchema,
		async execute(
			toolCallId: string,
			params: unknown,
			signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		): Promise<{
			content: Array<{ type: "text"; text: string }>;
			details: { answers: string[]; cancelled: boolean; error?: string };
		}> {
			const typed = params as { questions: Array<{ question: string; header: string; multiSelect?: boolean; options: Array<{ label: string; description: string; preview?: string }> }> };

			// 1. Browser tab connected → webui questionnaire dialog.
			if (bridge.hasWebClients()) {
				const payload: AskUserQuestionEventPayload = {
					toolCallId,
					questions: typed.questions.map((q) => ({
						question: q.question,
						header: q.header,
						multiSelect: q.multiSelect ?? false,
						options: q.options.map((o) => ({
							label: o.label,
							description: o.description,
							hasPreview: typeof o.preview === "string" && o.preview.length > 0,
						})),
					})),
				};
				const answerPromise = bridge.askUserQuestion(toolCallId, payload.questions);
				if (signal) {
					signal.addEventListener("abort", () => {
						bridge.resolveAskUserQuestion(toolCallId, { toolCallId, answers: [], cancelled: true });
					});
				}
				const answer = await answerPromise;
				if (answer.cancelled) {
					return {
						content: [{ type: "text", text: "The user declined the questionnaire (cancelled). Do not treat this as a decision - ask as plain text if you still need an answer." }],
						details: { answers: [], cancelled: true },
					};
				}
				const summary = answer.answers
					.map((a, i) => `${typed.questions[i]?.header ?? `Q${i + 1}`}: ${a}`)
					.join("\n");
				return {
					content: [{ type: "text", text: `User answers:\n${summary}` }],
					details: { answers: answer.answers, cancelled: false },
				};
			}

			// 2. No browser → fall back to TUI native dialogs (ui.select/ui.input),
			// mirroring rpiv-ask-user-question's RPC walker so pure-TUI still works.
			const tui = await askInTui(ctx, typed);
			if (tui.noUi) {
				return {
					content: [
						{
							type: "text",
							text: "Error: no interactive UI available (neither a webui browser tab nor native dialogs). Ask the questions as plain chat text instead of using this tool.",
						},
					],
					details: { answers: [], cancelled: true, error: "no_ui" },
				};
			}
			if (tui.cancelled) {
				return {
					content: [{ type: "text", text: "The user declined the questionnaire (cancelled). Do not treat this as a decision - ask as plain text if you still need an answer." }],
					details: { answers: [], cancelled: true },
				};
			}
			const summary = tui.answers
				.map((a, i) => `${typed.questions[i]?.header ?? `Q${i + 1}`}: ${a}`)
				.join("\n");
			return {
				content: [{ type: "text", text: `User answers:\n${summary}` }],
				details: { answers: tui.answers, cancelled: false },
			};
		},
	});

	// TUI fallback for ask_user_question when no browser tab is connected.
	// Mirrors rpiv-ask-user-question's RPC walker: one native dialog per
	// question (ui.select for single-choice incl. a "Type something." row,
	// ui.input for multi-select numbers / free text). Returns noUi:true when
	// the host has no dialog primitives (non-interactive runs).
	async function askInTui(
		ctx: ExtensionContext,
		typed: { questions: Array<{ question: string; header: string; multiSelect?: boolean; options: Array<{ label: string; description: string; preview?: string }> }> },
	): Promise<{ answers: string[]; cancelled: boolean; noUi: boolean }> {
		const ui = ctx.ui as Partial<{
			select: (title: string, options: string[]) => Promise<string | undefined>;
			input: (title: string, placeholder?: string) => Promise<string | undefined>;
		}> | undefined;
		if (typeof ui?.select !== "function" || typeof ui?.input !== "function") {
			return { answers: [], cancelled: false, noUi: true };
		}
		const answers: string[] = [];
		for (const [qi, q] of typed.questions.entries()) {
			const header = q.header ? `[${q.header}] ` : "";
			const title = `${header}${q.question}`;
			if (q.multiSelect) {
				const list = q.options.map((o, i) => `${i + 1}. ${o.label} — ${o.description}`).join("\n");
				const value = await ui.input(
					`${title}\n\n${list}\n\nEnter the numbers of all that apply, comma-separated (e.g. "1,3"), or type a custom answer as plain text.`,
					"1,3",
				);
				if (value == null) return { answers, cancelled: true, noUi: false };
				const trimmed = value.trim();
				if (!trimmed) { answers.push(""); continue; }
				const tokens = trimmed.split(/[,\s]+/).filter((tok) => tok.length > 0);
				const indices = tokens.map((tok) => (/^\d+\.?$/.test(tok) ? Number.parseInt(tok, 10) - 1 : -1));
				if (indices.every((i) => i >= 0 && i < q.options.length)) {
					const selected: string[] = [];
					for (const i of indices) {
						const label = q.options[i].label;
						if (!selected.includes(label)) selected.push(label);
					}
					answers.push(selected.join(", "));
				} else {
					answers.push(trimmed); // custom answer
				}
			} else {
				const options = q.options.map((o, i) => `${i + 1}. ${o.label} — ${o.description}`);
				const typeRow = `${q.options.length + 1}. Type something.`;
				options.push(typeRow);
				const chosen = await ui.select(title, options);
				if (chosen == null) return { answers, cancelled: true, noUi: false };
				const m = /^(\d+)/.exec(chosen);
				if (!m) return { answers, cancelled: true, noUi: false };
				const n = Number.parseInt(m[1], 10);
				if (n >= 1 && n <= q.options.length) {
					answers.push(q.options[n - 1].label);
				} else if (n === q.options.length + 1) {
					const typed2 = await ui.input(`${title}\n\nType your answer:`);
					if (typed2 == null) return { answers, cancelled: true, noUi: false };
					answers.push(typed2);
				} else {
					return { answers, cancelled: true, noUi: false };
				}
			}
		}
		return { answers, cancelled: false, noUi: false };
	}

	// Keep `ask_user_question` in the active tool set while the host has UI
	// (browser tab OR native dialogs). Mirrors rpiv-ask-user-question's
	// reconciler; the execute body routes to webui vs TUI dialogs.
	pi.on("before_agent_start", (_event, ctx: ExtensionContext) => {
		const active = pi.getActiveTools();
		const hasTool = active.includes("ask_user_question");
		const want = ctx.hasUI;
		if (want && !hasTool) {
			pi.setActiveTools([...active, "ask_user_question"]);
		} else if (!want && hasTool) {
			pi.setActiveTools(active.filter((n) => n !== "ask_user_question"));
		}
	});

	pi.registerCommand("webui-setup", {
		description: "Capture command context so the webui can manage sessions (run once per session)",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			bridge.setCommandContext(ctx);
			autoSetupDone = true;
			ctx.ui.notify("pi-webui: session control enabled", "info");
			// Re-broadcast snapshot so the UI flips setupDone=true.
			dispatchEvent({ setup: true }, "session_info_changed");
		},
	});

	pi.registerCommand("webui-start", {
		description: "Start the pi-webui bridge server",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (server) {
				ctx.ui.notify(`pi-webui already running at ${server.url}`, "warning");
				return;
			}
			bridge.setCommandContext(ctx);
			autoSetupDone = true;
			server = await startServer(bridge, {
				host: settings.host ?? DEFAULT_HOST,
				port: settings.port ?? DEFAULT_PORT,
				path: settings.wsPath ?? DEFAULT_WS_PATH,
			});
			ctx.ui.setStatus(
				"webui",
				`webui: ${server.url.replace("ws://", "http://")}`,
			);
			ctx.ui.notify(`pi-webui started at ${server.url}`, "info");
		},
	});

	pi.registerCommand("webui-stop", {
		description: "Stop the pi-webui bridge server",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (!server) {
				ctx.ui.notify("pi-webui is not running", "warning");
				return;
			}
			await server.close();
			server = null;
			ctx.ui.setStatus("webui", undefined);
			ctx.ui.notify("pi-webui stopped", "info");
		},
	});

	pi.registerCommand("webui-status", {
		description: "Show pi-webui status (URL, clients, setup)",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (!server) {
				ctx.ui.notify("pi-webui: not running. Use /webui-start", "info");
				return;
			}
			const snap = bridge.getSnapshot();
			const setup = Object.keys(bridge["commandCtx"] ?? {}).length > 0;
			const reason = bridge.getSessionStartReason();
			ctx.ui.notify(
				`pi-webui: ${server.url} • setup=${setup ? "yes" : "no"} • reason=${reason ?? "n/a"} • cwd=${snap?.cwd ?? "?"}`,
				"info",
			);
		},
	});

	pi.registerCommand("webui-open", {
		description: "Print the pi-webui URL (open manually in browser)",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (!server) {
				ctx.ui.notify("pi-webui is not running. Use /webui-start first", "warning");
				return;
			}
			const url = server.url.replace("ws://", "http://");
			ctx.ui.notify(`pi-webui URL: ${url}`, "info");
		},
	});

	// ─────────── auto-start ───────────

	if (!settings.disabled) {
		pi.on("session_start", async () => {
			// Avoid double-start if a /webui-start was already issued.
			if (server) return;
			try {
				server = await startServer(bridge, {
					host: settings.host ?? DEFAULT_HOST,
					port: settings.port ?? DEFAULT_PORT,
					path: settings.wsPath ?? DEFAULT_WS_PATH,
				});
				bridge["latestCtx"]?.ui.setStatus(
					"webui",
					`webui: ${server.url.replace("ws://", "http://")}`,
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				bridge["latestCtx"]?.ui.notify(`pi-webui failed to start: ${message}`, "error");
			}
		});

		pi.on("session_shutdown", async () => {
			bridge.rejectAllAskQuestions("session ended");
			if (!server) return;
			try {
				await server.close();
			} catch {
				// ignore
			}
			server = null;
		});
	}
}
