/**
 * Wire protocol between the pi extension and the browser extension.
 *
 * The server is a thin WebSocket relay. Every browser message is a request
 * carrying a unique `id`; the server returns a single response with the
 * same `id`. Pi-side events are pushed to the browser as unsolicited
 * `event` messages. New client connections receive a `snapshot` message
 * with the current state plus a `hello` metadata handshake.
 */

export const DEFAULT_PORT = 9777;
export const SERVER_VERSION = "0.1.0";

// ────────────────────────────────────────────────────────────────────────────
// Browser → server (request / RPC)
// ────────────────────────────────────────────────────────────────────────────
export interface BrowserRequest {
	/** Caller-supplied id; mirrored on the response so the client can correlate. */
	id: string;
	action: BrowserAction;
	payload?: Record<string, unknown>;
}

export type BrowserAction =
// snapshot / sync
| "get_snapshot"
| "get_state"
| "get_entries"
| "get_history"
| "get_tree"
| "get_messages"
| "get_available_models"
| "get_available_tools"
// sessions on disk
| "list_sessions"
| "list_files"
// send / abort
| "send_message"
| "prompt"
| "steer"
| "follow_up"
| "abort"
| "shutdown"
// editor
| "set_editor_text"
| "paste_to_editor"
| "get_editor_text"
// model / thinking / tools
| "set_model"
| "set_thinking_level"
| "set_active_tools"
// session metadata
| "set_session_name"
| "set_label"
// compaction
| "compact"
// misc
| "notify"
| "exec"
| "context_view"
// session control (requires /webui-setup)
| "new_session"
| "fork"
| "switch_session"
| "navigate_tree"
| "reload"
| "ask_user_question_answer";

// ────────────────────────────────────────────────────────────────────────────
// Server → browser (response / event)
// ────────────────────────────────────────────────────────────────────────────

export interface BridgeResponse {
	type: "response";
	id: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

export interface SnapshotMessage {
	type: "snapshot";
	serverVersion: string;
	bridgeReady: boolean;
	setupDone: boolean;
	startReason?: string;
	cwd: string;
	mode: string;
	isIdle: boolean;
	sessionId: string | undefined;
	sessionFile: string | undefined;
	sessionDir: string | undefined;
	sessionName: string | undefined;
	model: ModelInfo | null;
	scopedModels: ModelInfo[];
	thinkingLevel: string;
	activeTools: string[];
	allTools: ExtensionToolInfo[];
	commands: Array<{ name: string; description?: string; source: string }>;
	port?: number;
	leafId?: string | null;
	tree?: SessionTreeNodeSummary[];
	entries?: SessionEntrySummary[];
	messages?: unknown[];
	powerbar?: {
		gitBranch?: string | null;
		context?: { pct: number; tokens: number; window: number } | null;
		tokens?: {
			input: number;
			output: number;
			cacheRead: number;
			cacheWrite: number;
			cost: number;
			cacheHitRate?: number;
		} | null;
		sub?: {
			provider?: string;
			windows: Array<{ label: string; usedPercent: number; resetDescription?: string }>;
		} | null;
	};
}

export type ServerMessage =
	| { type: "hello"; version: string; mode: string; connectedClients: number }
	| SnapshotMessage
	| { type: "event"; event: PiExtensionEvent }
	| BridgeResponse
	| { type: "ping"; ts: number }
	| { type: "pong"; ts: number };

// ────────────────────────────────────────────────────────────────────────────
// Sub-types
// ────────────────────────────────────────────────────────────────────────────

export interface ModelInfo {
	provider: string;
	id: string;
	name: string;
	api: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: string[];
}

export interface ExtensionToolInfo {
	name: string;
	description: string;
}

export interface ContextUsage {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export interface SessionEntrySummary {
	id: string;
	parentId: string | null;
	timestamp: string;
	type: string;
	label?: string;
	preview: string;
	role?: string;
	contentPreview?: string;
	summary?: string;
	fromId?: string;
	provider?: string;
	modelId?: string;
	level?: string;
	name?: string;
	targetId?: string;
	label_value?: string;
}

export interface SessionTreeNodeSummary {
	id: string;
	parentId: string | null;
	type: string;
	preview: string;
	label?: string;
	children: string[];
}

export interface SessionListItem {
	id: string;
	timestamp: string;
	name: string | null;
	firstMessage: string | null;
	cwd: string | null;
	file: string;
	filePath: string;
	mtime: number;
}

export interface SessionListGroup {
	path: string;
	dirName: string;
	sessions: SessionListItem[];
}

// ────────────────────────────────────────────────────────────────────────────
// Pi event envelope (subset of ExtensionEvent we forward to the browser)
// ────────────────────────────────────────────────────────────────────────────

export type PiExtensionEvent =
	| { type: "session_start"; reason?: string; previousSessionFile?: string }
	| { type: "session_info_changed"; name?: string }
	| { type: "session_shutdown"; reason?: string; targetSessionFile?: string }
	| { type: "session_tree"; newLeafId?: string | null; oldLeafId?: string | null }
	| { type: "agent_start" }
	| {
			type: "agent_end";
			messages?: unknown[];
	  }
	| { type: "agent_settled" }
	| { type: "turn_start"; turnIndex?: number }
	| {
			type: "turn_end";
			turnIndex?: number;
			message?: unknown;
			toolResults?: unknown[];
	  }
	| { type: "message_start"; message?: unknown }
	| {
			type: "message_update";
			message?: unknown;
			assistantMessageEvent?: unknown;
	  }
	| { type: "message_end"; message?: unknown }
	| {
			type: "tool_execution_start";
			toolCallId?: string;
			toolName?: string;
			args?: unknown;
	  }
	| {
			type: "tool_execution_update";
			toolCallId?: string;
			toolName?: string;
			args?: unknown;
			partialResult?: unknown;
	  }
	| {
			type: "tool_execution_end";
			toolCallId?: string;
			toolName?: string;
			result?: unknown;
			isError?: boolean;
	  }
	| {
			type: "model_select";
			model?: ModelInfo;
			previousModel?: ModelInfo | null;
			source?: string;
	  }
	| { type: "thinking_level_select"; level?: string; previousLevel?: string }
	| {
			type: "session_compact";
			compactionEntry?: unknown;
			reason?: string;
	  }
	| { type: "session_compact_failed"; errorMessage?: string; aborted?: boolean };

export type AgentMessage = {
	role?: string;
	content?: unknown;
	stopReason?: string;
	errorMessage?: string;
	usage?: unknown;
};

// ────────────────────────────────────────────────────────────────────────────
// Context view (`/context` parity — ported from pi-context-view)
// ────────────────────────────────────────────────────────────────────────────

export type ContextViewSource = {
	id: string;
	label: string;
	native: boolean;
};

export type ContextViewKind =
	| "base-prompt"
	| "tool"
	| "context-file"
	| "skills"
	| "append-prompt"
	| "injected-message"
	| "prompt-addition";

export interface ContextViewItem {
	id: string;
	kind: ContextViewKind;
	source: ContextViewSource;
	label: string;
	chars: number;
	tokens: number;
	/** Raw text for inline preview. WebUI truncates before display. */
	text?: string;
	children?: ContextViewItem[];
}

export interface ContextViewUsageCategory {
	label: string;
	tokens: number;
	children?: ContextViewUsageCategory[];
	entries?: ContextViewUsageEntry[];
}

export interface ContextViewUsageEntry {
	kind: string;
	label: string;
	tokens: number;
	chars?: number;
	truncatedText?: string;
}

export interface ContextViewData {
	snapshot: {
		items: ContextViewItem[];
		computedAt: string;
	};
	usage?: {
		estimatedTokens: number;
		reported?: {
			tokens?: number;
			contextWindow?: number;
			maxTokens?: number;
			pct?: number;
		};
		categories: ContextViewUsageCategory[];
	};
	modelLabel?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// ask_user_question (webui questionnaire parity with rpiv-ask-user-question)
// ────────────────────────────────────────────────────────────────────────────
export interface AskUserQuestionOption {
	label: string;
	description: string;
	hasPreview?: boolean;
}

export interface AskUserQuestionPrompt {
	question: string;
	header: string;
	multiSelect: boolean;
	options: AskUserQuestionOption[];
}

/** Bridge → browser: the model called ask_user_question, waiting on user input */
export interface AskUserQuestionEventPayload {
	toolCallId: string;
	questions: AskUserQuestionPrompt[];
}

/** Browser → bridge: user answered the questionnaire */
export interface AskUserQuestionAnswerPayload {
	toolCallId: string;
	/** One answer per question (same order as questions). */
	answers: string[];
	cancelled?: boolean;
}

