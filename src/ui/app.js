/* ─────────────────────────────────────────────────────────────────────────────
 * pi-webui — front-end (TUI-parity)
 *
 * Connects to the WebSocket bridge exposed by the pi-webui extension, renders
 * pi session events in real time, and exposes the full command surface
 * available to the TUI: slash commands (autocomplete popup), command palette
 * (Ctrl+K), model / thinking / tool pickers, session ops (new / fork / compact
 * / reload / name / export), history tree navigation, prompt / steer /
 * follow-up modes with image attachment, copy buttons, collapsible tool output,
 * streaming cursor, toasts, dark / light / auto theme, en / zh / auto i18n,
 * toast error retry, full keyboard shortcuts (Enter / Shift+Enter / Ctrl+. /
 * Ctrl+Shift+Enter / Ctrl+T / Ctrl+U / Ctrl+K / F1 / Esc).
 * ────────────────────────────────────────────────────────────────────────────*/

// If the server injected its own host/port, prefer those (multi-instance support).
const SERVER_INJECTED = (typeof window !== "undefined" && window.__PI_WEBUI__) || null;
const STORAGE_KEY = "pi-webui-settings";
const HISTORY_KEY = "pi-webui-history";
const DEFAULT_SETTINGS = {
	host: SERVER_INJECTED?.host || "127.0.0.1",
	port: SERVER_INJECTED?.port || 9777,
	wsPath: SERVER_INJECTED?.wsPath || "/ws",
	theme: "auto",
	lang: "auto",
	autoReconnect: true,
	showToolCalls: true,
	showThinking: true,
	autoscroll: true,
	markdown: true,
	collapseTools: true,
};

/* ─────────────────────────────────────────────────────────────────────────────
 * i18n — auto / en / zh
 * ────────────────────────────────────────────────────────────────────────────*/
const I18N = {
	en: {
		"title": "pi-webui",
		"description": "Browser companion for the pi agent webui extension",
		"status.disconnected": "disconnected",
		"status.connecting": "connecting…",
		"status.connected": "connected",
		"mode.loading": "loading…",
		"mode.busy": "busy",
		"abort": "abort",
		"abort.title": "Abort current turn (Esc)",
		"palette.title": "Command palette (Ctrl+K)",
		"palette.button": "palette",
		"help.title": "Keyboard shortcuts",
		"theme.toggle": "Toggle theme",
		"lang.toggle": "Toggle language",
		"settings.title": "pi-webui settings",
		"settings.host": "bridge host",
		"settings.port": "bridge port",
		"settings.auto-reconnect": "auto-reconnect on disconnect",
		"settings.show-tools": "show tool calls",
		"settings.show-thinking": "show thinking blocks",
		"settings.autoscroll": "autoscroll on new messages",
		"settings.markdown": "render markdown",
		"settings.collapse-tools": "collapse tool output by default",
		"settings.cancel": "cancel",
		"settings.save": "save",
		"label.model": "model",
		"label.model.title": "Pick a model",
		"label.thinking": "thinking",
		"label.thinking.title": "Thinking level (Ctrl+T to cycle)",
		"label.session": "session name",
		"label.cwd": "cwd",
		"cycle-thinking.title": "Cycle thinking level (Ctrl+T)",
		"placeholder.unnamed": "(unnamed)",
		"select.loading": "loading…",
		"select.empty": "no models",
		"tools.label": "tools",
		"commands.label": "commands",
		"session-ops.new": "new",
		"session-ops.fork": "fork",
		"session-ops.compact": "compact",
		"session-ops.reload": "reload",
		"session-ops.rename": "name",
		"session-ops.export": "export",
		"session-ops.refresh": "refresh history",
		"session-ops.hint": "Run <code>/webui-setup</code> in your terminal for session ops.",
		"history.label": "history",
		"history.empty": "no history yet",
		"empty.title": "Start a conversation",
		"empty.hint": "Type a message below or use <code>Ctrl+K</code> for the command palette.",
		"scroll.bottom": "Scroll to latest",
		"autoscroll.off": "autoscroll off",
		"composer.placeholder": "Type a message to the agent. Enter sends, Shift+Enter newline. / opens commands. Ctrl+K for palette.",
		"composer.attach": "Attach image (Ctrl+U)",
		"composer.expand": "Expand composer",
		"composer.send": "send",
		"composer.send.title": "Send message (Enter)",
		"composer.steer": "steer",
		"composer.steer.title": "Steer mid-turn (Ctrl+.)",
		"composer.followup": "follow up",
		"composer.followup.title": "Follow up after turn (Ctrl+Shift+Enter)",
		"composer.hint-idle": "Enter to send · ⌘K for palette · / for commands",
		"composer.hint-busy": "busy — steer or follow up",
		"composer.hint-disabled": "not connected",
		"loading.connecting": "connecting…",
		"prompt.cancel": "cancel",
		"prompt.ok": "ok",
		"palette.placeholder": "Type a command, model name, or session action…",
		"msg.error": "Error: {error}",
		"msg.aborted": "aborted",
		"msg.new-session": "new session started",
		"msg.forked": "forked last turn",
		"msg.compacted": "compacted context",
		"msg.reloaded": "session reloaded",
		"msg.no-content": "Type something first",
		"msg.copied": "copied to clipboard",
		"msg.settings-saved": "settings saved",
		"msg.reconnecting": "reconnecting in {sec}s…",
		"msg.connected": "connected",
		"msg.disconnected": "disconnected",
		"msg.model-changed": "model: {model}",
		"msg.thinking-changed": "thinking: {level}",
		"msg.session-renamed": "renamed to “{name}”",
		"msg.exported": "exported to {url}",
		"msg.tool-active-count": "{active}/{total} tools active",
		"bubble.user": "You",
		"bubble.assistant": "π",
		"bubble.thinking": "thinking",
		"bubble.tool": "tool",
		"bubble.system": "system",
		"action.copy": "Copy",
		"action.copied": "Copied ✓",
		"action.copy-args": "Copy arguments",
		"action.copy-output": "Copy output",
		"action.expand": "Expand",
		"action.collapse": "Collapse",
		"action.regenerate": "Regenerate",
		"action.edit": "Edit",
		"action.fork-here": "Fork from here",
		"action.delete": "Clear session",
		"cmd.new": "Start a new session",
		"cmd.fork": "Fork from the last entry",
		"cmd.compact": "Compact the context window",
		"cmd.reload": "Reload the current session",
		"cmd.name": "Rename this session",
		"cmd.export": "Export the session to a file",
		"cmd.model": "Change the active model",
		"cmd.thinking": "Change the thinking level",
		"cmd.tools": "Toggle which tools are active",
		"cmd.history": "Browse session history",
		"cmd.abort": "Abort the running turn",
		"cmd.theme": "Toggle light / dark / auto theme",
		"cmd.lang": "Toggle English / 中文 / auto",
		"cmd.help": "Show keyboard shortcuts",
		"cmd.settings": "Open settings",
		"cmd.disconnect": "Disconnect from the bridge",
		"cmd.reconnect": "Reconnect to the bridge",
		"cmd.context": "Inspect context usage / injections",
		"context.title": "Context usage",
		"context.tab-usage": "usage",
		"context.tab-injections": "injections",
		"context.refresh": "refresh",
		"context.error": "error",
		"context.loading": "computing…",
		"context.no-setup": "Run /webui-setup once, then refresh.",
		"context.not-ready": "Not available yet.",
		"context.empty": "No context data yet.",
		"context.col-category": "category",
		"context.col-tokens": "tokens",
		"ask.title": "Ask user",
		"ask.cancel": "Cancel",
		"ask.submit": "Submit",
		"ask.required": "Please answer every question.",
	},

	zh: {
		"title": "pi-webui",
		"description": "pi agent webui 扩展的浏览器伴侣",
		"status.disconnected": "未连接",
		"status.connecting": "连接中…",
		"status.connected": "已连接",
		"mode.loading": "加载中…",
		"mode.busy": "运行中",
		"abort": "中止",
		"abort.title": "中止当前回合（Esc）",
		"palette.title": "命令面板（Ctrl+K）",
		"palette.button": "面板",
		"help.title": "键盘快捷键",
		"theme.toggle": "切换主题",
		"lang.toggle": "切换语言",
		"settings.title": "pi-webui 设置",
		"settings.host": "桥接主机",
		"settings.port": "桥接端口",
		"settings.auto-reconnect": "断线自动重连",
		"settings.show-tools": "显示工具调用",
		"settings.show-thinking": "显示思考块",
		"settings.autoscroll": "新消息自动滚动",
		"settings.markdown": "渲染 Markdown",
		"settings.collapse-tools": "默认折叠工具输出",
		"settings.cancel": "取消",
		"settings.save": "保存",
		"label.model": "模型",
		"label.model.title": "选择模型",
		"label.thinking": "思考",
		"label.thinking.title": "思考级别（Ctrl+T 循环）",
		"label.session": "会话名",
		"label.cwd": "工作目录",
		"cycle-thinking.title": "循环思考级别（Ctrl+T）",
		"placeholder.unnamed": "（未命名）",
		"select.loading": "加载中…",
		"select.empty": "无可用模型",
		"tools.label": "工具",
		"commands.label": "命令",
		"session-ops.new": "新建",
		"session-ops.fork": "分叉",
		"session-ops.compact": "压缩",
		"session-ops.reload": "重载",
		"session-ops.rename": "重命名",
		"session-ops.export": "导出",
		"session-ops.refresh": "刷新历史",
		"session-ops.hint": "在终端运行 <code>/webui-setup</code> 启用会话操作。",
		"history.label": "历史",
		"history.empty": "暂无历史",
		"empty.title": "开始对话",
		"empty.hint": "在下方输入消息，或按 <code>Ctrl+K</code> 打开命令面板。",
		"scroll.bottom": "滚到底部",
		"autoscroll.off": "自动滚动已关闭",
		"composer.placeholder": "向 agent 输入消息。Enter 发送，Shift+Enter 换行。/ 打开命令，Ctrl+K 命令面板。",
		"composer.attach": "附加图片（Ctrl+U）",
		"composer.expand": "展开输入框",
		"composer.send": "发送",
		"composer.send.title": "发送消息（Enter）",
		"composer.steer": "中途转向",
		"composer.steer.title": "中途转向（Ctrl+.）",
		"composer.followup": "追问",
		"composer.followup.title": "回合结束后追问（Ctrl+Shift+Enter）",
		"composer.hint-idle": "Enter 发送 · ⌘K 面板 · / 命令",
		"composer.hint-busy": "运行中 — 可转向或追问",
		"composer.hint-disabled": "未连接",
		"loading.connecting": "连接中…",
		"prompt.cancel": "取消",
		"prompt.ok": "确定",
		"palette.placeholder": "输入命令、模型名或会话操作…",
		"msg.error": "错误：{error}",
		"msg.aborted": "已中止",
		"msg.new-session": "已开始新会话",
		"msg.forked": "已分叉上一回合",
		"msg.compacted": "已压缩上下文",
		"msg.reloaded": "已重载会话",
		"msg.no-content": "请先输入内容",
		"msg.copied": "已复制到剪贴板",
		"msg.settings-saved": "设置已保存",
		"msg.reconnecting": "{sec} 秒后重连…",
		"msg.connected": "已连接",
		"msg.disconnected": "已断开",
		"msg.model-changed": "模型：{model}",
		"msg.thinking-changed": "思考：{level}",
		"msg.session-renamed": "已重命名为「{name}」",
		"msg.exported": "已导出到 {url}",
		"msg.tool-active-count": "{active}/{total} 个工具已启用",
		"bubble.user": "你",
		"bubble.assistant": "π",
		"bubble.thinking": "思考",
		"bubble.tool": "工具",
		"bubble.system": "系统",
		"action.copy": "复制",
		"action.copied": "已复制 ✓",
		"action.copy-args": "复制参数",
		"action.copy-output": "复制输出",
		"action.expand": "展开",
		"action.collapse": "折叠",
		"action.regenerate": "重新生成",
		"action.edit": "编辑",
		"action.fork-here": "从此处分叉",
		"action.delete": "清空会话",
		"cmd.new": "开始新会话",
		"cmd.fork": "从最后一条分叉",
		"cmd.compact": "压缩上下文窗口",
		"cmd.reload": "重载当前会话",
		"cmd.name": "重命名本会话",
		"cmd.export": "导出会话到文件",
		"cmd.model": "切换当前模型",
		"cmd.thinking": "切换思考级别",
		"cmd.tools": "切换启用的工具",
		"cmd.history": "浏览会话历史",
		"cmd.abort": "中止运行中的回合",
		"cmd.theme": "切换浅色 / 深色 / 自动 主题",
		"cmd.lang": "切换 英文 / 中文 / 自动",
		"cmd.help": "显示键盘快捷键",
		"cmd.settings": "打开设置",
		"cmd.disconnect": "断开桥接",
		"cmd.reconnect": "重新连接桥接",
		"cmd.context": "查看上下文用量/注入组成",
		"context.title": "上下文用量",
		"context.tab-usage": "用量",
		"context.tab-injections": "注入组成",
		"context.refresh": "刷新",
		"context.error": "出错",
		"context.loading": "计算中…",
		"context.no-setup": "请先运行 /webui-setup,然后刷新。",
		"context.not-ready": "暂不可用。",
		"context.empty": "暂无上下文数据。",
		"context.col-category": "类别",
		"context.col-tokens": "tokens",
		"ask.title": "向用户提问",
		"ask.cancel": "取消",
		"ask.submit": "提交",
		"ask.required": "请回答所有问题。",
	},
};

/* ─────────────────────────────────────────────────────────────────────────────
 * global state
 * ────────────────────────────────────────────────────────────────────────────*/
const state = {
	settings: structuredClone(DEFAULT_SETTINGS),
	ws: null,
	connected: false,
	snapshot: null,
	hello: null,
	pending: new Map(),   // requestId → {resolve, reject}
	nextId: 1,
	mode: "disconnected", // "disconnected" | "idle" | "busy"
	bubbles: new Map(),   // messageId → bubble element
	messagesSkipped: 0,
	oldestMessageId: "",
	loadingEarlier: false,
	currentAssistantBubble: null,
imageAttachments: [], // [{ dataUrl, name, size }] — supports multi-image
	streamingMessageId: null,
	autoscroll: true,
	reconnectAttempt: 0,
	reconnectTimer: null,
	slashMenuOpen: false,
	slashMenuIndex: 0,
	slashMenuMatches: [],
	paletteOpen: false,
};

/* ─────────────────────────────────────────────────────────────────────────────
 * tiny helpers
 * ────────────────────────────────────────────────────────────────────────────*/
const $ = (id) => document.getElementById(id);
function tpl(str, vars) {
	return String(str ?? "").replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? `{${k}}`);
}
function detectLang() {
	const raw = (navigator.language || "en").toLowerCase();
	return raw.startsWith("zh") ? "zh" : "en";
}
function detectTheme() {
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function lang() { return state.settings.lang === "auto" ? detectLang() : state.settings.lang; }
function escapeHtml(s) {
return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
}
// AgentMessage.content can be a plain string OR (most often) an array of parts:
// [{type:"text",text:"..."}, {type:"thinking",thinking:"..."}, {type:"image",...}, ...]
// Returning an array toString() gives "[object Object],[object Object]" — so we extract.
function extractText(msg) {
if (msg == null) return "";
if (typeof msg === "string") return msg;
if (typeof msg.text === "string") return msg.text;
if (typeof msg.content === "string") return msg.content;
if (Array.isArray(msg.content)) {
const parts = msg.content.map(p => {
if (!p) return "";
if (typeof p === "string") return p;
if (p.type === "text" && typeof p.text === "string") {
// Streaming intermediates can carry the reasoning text at the start of
// the first text part (pi folds it there until the message finalizes).
return /^\s*thinking/.test(p.text) ? "" : p.text;
}
if (p.type === "thinking" && typeof p.thinking === "string") return ""; // rendered separately
if (p.type === "image") return `![image](${p.data ? String(p.data).slice(0, 32) + "…" : "image"})`;
return "";
});
return parts.filter(Boolean).join("\n\n");
	}
	return "";
}
function extractThinking(msg) {
// Reasoning text lives either in a {type:"thinking"} part (final messages),
// the top-level msg.thinking field, or — during streaming — folded into the
// first text part with a leading "thinking" marker.
if (!msg) return "";
if (typeof msg.thinking === "string" && msg.thinking) return msg.thinking;
if (Array.isArray(msg.content)) {
const out = [];
for (const p of msg.content) {
if (!p) continue;
if (p.type === "thinking" && typeof p.thinking === "string" && p.thinking) out.push(p.thinking);
else if (p.type === "text" && typeof p.text === "string" && /^\s*thinking/.test(p.text)) out.push(p.text.replace(/^\s*thinking/, ""));
}
return out.join("\n\n");
}
return "";
}
function debounce(fn, ms) {
	let t;
	return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function formatTime(ts) {
	try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
	catch { return ""; }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * persistence
 * ────────────────────────────────────────────────────────────────────────────*/
function loadSettings() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const saved = JSON.parse(raw);
			state.settings = { ...DEFAULT_SETTINGS, ...saved };
		}
	} catch {}
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (raw) state.history = JSON.parse(raw);
	} catch { state.history = []; }
}
async function saveSettings() {
	const next = {
		host: $("cfg-host").value || DEFAULT_SETTINGS.host,
		port: parseInt($("cfg-port").value, 10) || DEFAULT_SETTINGS.port,
		autoReconnect: $("cfg-auto-reconnect").checked,
		showToolCalls: $("cfg-show-tool-calls").checked,
		showThinking: $("cfg-show-thinking").checked,
		autoscroll: $("cfg-autoscroll").checked,
		markdown: $("cfg-markdown").checked,
		collapseTools: $("cfg-collapse-tools").checked,
		theme: state.settings.theme,
		lang: state.settings.lang,
	};
	state.settings = next;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	state.autoscroll = next.autoscroll;
	updateAutoscrollIndicator();
}
function pushHistory(text) {
	if (!text) return;
	const trimmed = text.trim();
	if (!trimmed) return;
	state.history ||= [];
	state.history = [trimmed, ...state.history.filter((x) => x !== trimmed)].slice(0, 80);
	try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch {}
}

/* ─────────────────────────────────────────────────────────────────────────────
 * apply i18n to DOM
 * ────────────────────────────────────────────────────────────────────────────*/
function applyLang(l) {
	const safe = l === "zh" ? "zh" : "en";
	document.documentElement.setAttribute("data-lang", safe);
	const dict = I18N[l] || I18N.en;
	const updates = {
		"title": [document.title],
	};
	for (const el of document.querySelectorAll("[data-i18n]")) {
		const key = el.getAttribute("data-i18n");
		const text = dict[key];
		if (text == null) continue;
		if (el.tagName === "META") el.setAttribute("content", text);
		else el.textContent = text;
	}
	for (const el of document.querySelectorAll("[data-i18n-attr-title]")) {
		const key = el.getAttribute("data-i18n-attr-title");
		const text = dict[key];
		if (text != null) el.title = text;
	}
	for (const el of document.querySelectorAll("[data-i18n-attr-placeholder]")) {
		const key = el.getAttribute("data-i18n-attr-placeholder");
		const text = dict[key];
		if (text != null) el.placeholder = text;
	}
}

/* ─────────────────────────────────────────────────────────────────────────────
 * toasts
 * ────────────────────────────────────────────────────────────────────────────*/
function notify(text, level = "info", ttl = 3200) {
	const dict = I18N[lang()] || I18N.en;
	const wrap = $("toasts");
	if (!wrap) return;
	const t = document.createElement("div");
	t.className = `toast ${level}`;
	t.textContent = text;
	wrap.appendChild(t);
	setTimeout(() => {
		t.classList.add("fading");
		setTimeout(() => t.remove(), 320);
	}, ttl);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * WebSocket transport
 * ────────────────────────────────────────────────────────────────────────────*/
function wsUrl() {
	const { host, port, wsPath } = state.settings;
	return `ws://${host}:${port}${wsPath || "/ws"}`;
}
function setStatus(connected, label) {
	const dot = $("status-dot");
	const txt = $("status-text");
	const det = $("connection-detail");
	dot.classList.remove("connected", "connecting", "disconnected");
	dot.classList.add(connected ? "connected" : state.ws ? "connecting" : "disconnected");
	if (label) txt.textContent = label;
	if (det) det.textContent = state.settings.host ? `${state.settings.host}:${state.settings.port}` : "";
}
function connect() {
	if (state.ws) try { state.ws.close(); } catch {}
	const d = I18N[lang()] || I18N.en;
	setStatus(false, d["status.connecting"]);
	$("loading-overlay")?.classList.remove("hidden");
	let ws;
	try { ws = new WebSocket(wsUrl()); } catch (e) {
		$("loading-overlay")?.classList.add("hidden");
		notify(tpl(d["msg.error"], { error: e.message }), "error");
		scheduleReconnect();
		return;
	}
	state.ws = ws;
	ws.addEventListener("open", () => {
		state.connected = true;
		state.reconnectAttempt = 0;
		const d = I18N[lang()] || I18N.en;
		setStatus(true, d["status.connected"]);
		updateComposerHint();
		$("loading-overlay")?.classList.add("hidden");
		$("send").disabled = false;
	});
	ws.addEventListener("close", () => {
		state.connected = false;
		const d = I18N[lang()] || I18N.en;
		setStatus(false, d["status.disconnected"]);
		updateComposerHint();
		$("send").disabled = true;
		$("loading-overlay")?.classList.add("hidden");
		if (state.settings.autoReconnect) scheduleReconnect();
	});
	ws.addEventListener("error", () => {
		// 'close' will follow with details
	});
	ws.addEventListener("message", (e) => onWsMessage(e.data));
}

// Scan a small port range to discover a running pi-webui instance.
// Called once on startup; if the configured port doesn't work, tries 9778, 9779, ...
async function discoverBridge() {
	const start = state.settings.port || 9777;
	const tried = new Set();
	const candidates = [];
	for (let p = start; p < start + 20 && p < 9800; p++) candidates.push(p);
	for (let p = 9777; p < start; p++) candidates.push(p);
	for (const port of candidates) {
		if (tried.has(port)) continue;
		tried.add(port);
		try {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 600);
			const r = await fetch(`http://127.0.0.1:${port}/instances`, { signal: ctrl.signal });
			clearTimeout(t);
			if (r.ok) {
				const body = await r.json();
				if (Array.isArray(body.instances) && body.instances.length > 0) {
					const inst = body.instances.sort((a, b) => b.startedAt - a.startedAt)[0];
					state.settings.host = inst.host || "127.0.0.1";
					state.settings.port = inst.port;
					saveSettings();
					return true;
				}
			}
		} catch {}
	}
	return false;
}

function scheduleReconnect() {
	if (state.reconnectTimer) return;
	if (!state.settings.autoReconnect) return;
	state.reconnectAttempt++;
	const delay = Math.min(8000, 600 * Math.pow(1.4, state.reconnectAttempt));
	const d = I18N[lang()] || I18N.en;
	// Silently retry — status chip in the header already reflects connection state.
	// (User requested no toast notifications for connect/disconnect events.)
	state.reconnectTimer = setTimeout(() => {
		state.reconnectTimer = null;
		connect();
	}, delay);
}
function request(action, payload) {
	return new Promise((resolve, reject) => {
		const ws = state.ws;
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			reject(new Error("not connected"));
			return;
		}
		const id = `r${state.nextId++}`;
		state.pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ type: action, id, payload: payload ?? {} }));
	});
}
function onWsMessage(raw) {
	let msg;
	try { msg = JSON.parse(raw); } catch { return; }
	if (msg.type === "hello") {
		state.hello = msg;
		state.snapshot = msg.snapshot ?? state.snapshot;
		if (state.snapshot) {
			renderSnapshot();
			// Replay initial messages
			if (Array.isArray(state.snapshot?.messages)) replayInitialMessages(state.snapshot.messages);
		}
		return;
	}
	if (msg.type === "snapshot") {
		// Server sends the snapshot as a FLAT object: { type:"snapshot", mode, scopedModels, thinkingLevel, ... }
		// Strip the `type` field and use the rest as the snapshot payload.
		const { type: _t, ...data } = msg;
		state.snapshot = data;
		renderSnapshot();
		if (Array.isArray(state.snapshot.messages)) replayInitialMessages(state.snapshot.messages);
		return;
	}
	if (msg.type === "response") {
		const pending = state.pending.get(msg.id);
		if (pending) {
			state.pending.delete(msg.id);
			if (msg.success) pending.resolve(msg.data);
			else pending.reject(new Error(msg.error || "unknown error"));
		}
		return;
	}
	if (msg.type === "event") {
		handleEvent(msg.event);
		return;
	}
}

/* ─────────────────────────────────────────────────────────────────────────────
 * event handling
 * ────────────────────────────────────────────────────────────────────────────*/
function handleEvent(evt) {
	if (!evt || !evt.type) return;
	switch (evt.type) {
		case "agent_start":
		case "agent_end":
			break;
		case "turn_start":
			setMode("busy");
			state.currentAssistantBubble = null;
			break;
		case "turn_end":
			setMode("idle");
			state.currentAssistantBubble = null;
			state.streamingMessageId = null;
			refreshState();
			break;
		case "message_start":
			onMessageStart(evt.message);
			break;
		case "message_update":
			onMessageUpdate(evt);
			break;
		case "message_end":
			onMessageEnd(evt.message);
			break;
		case "tool_execution_start":
		case "tool_execution_update":
		case "tool_execution_end":
			handleToolEvent(evt);
			// PowerBar parity: refresh stats (tokens/context/git/sub) after tool results.
			if (evt.type === "tool_execution_end") refreshPowerbar();
			break;
		case "model_select":
			if (state.snapshot && evt.model) {
				state.snapshot.model = evt.model;
				renderModelSelect();
			}
			break;
		case "thinking_level_change":
			if (state.snapshot && evt.level) {
				state.snapshot.thinkingLevel = evt.level;
				renderThinkingSelect();
			}
		case "thinking_level_select":
			if (state.snapshot && evt.level) {
				state.snapshot.thinkingLevel = evt.level;
				renderThinkingSelect();
			}
			break;
		case "session_start":
		case "session_info_changed":
		case "session_tree":
		case "session_shutdown":
			refreshSession(evt);
			break;
		case "ask_user_question":
			openAskDialog(evt);
			break;
		case "ask_user_question_cancelled":
			closeAskDialog(true);
			break;
	}
}

async function refreshSession(evt) {
	try {
		const snap = await request("get_state");
		if (!snap || !snap.success) return;
		const data = snap.data;
		const { type: _t, ...rest } = data;
		state.snapshot = { ...state.snapshot, ...rest };
		// Only fully reload messages on session_start (new session). For info/tree 
		// changes just refresh dropdowns/titles.
		if (evt && evt.type === "session_start") {
			$("messages").innerHTML = "";
			state.bubbles.clear();
			state.currentAssistantBubble = null;
			replayInitialMessages(state.snapshot.messages || []);
		}
		renderSnapshot();
	} catch (err) {
		console.warn("refreshSession failed:", err);
	}
}

function setMode(m) {
	state.mode = m;
	$("mode").textContent = m === "busy" ? (I18N[lang()]?.["mode.busy"] ?? "busy") : (state.snapshot?.mode ?? "idle");
	$("busy").classList.toggle("hidden", m !== "busy");
	$("abort").disabled = m !== "busy";
	$("steer").disabled = m !== "busy";
	$("follow-up").disabled = m === "busy";
	updateComposerHint();
}
function onMessageStart(msg) {
	if (!msg) return;
	if (msg.role === "assistant") {
		const b = makeBubble({
			kind: "assistant",
			name: bubbleLabel("assistant"),
			body: "",
		});
		$("messages").appendChild(b.wrap);
		state.bubbles.set(msg.id, b);
		state.currentAssistantBubble = b;
		state.streamingMessageId = msg.id;
		b.wrap.classList.add("streaming");
	} else if (msg.role === "user") {
		// user bubble was rendered locally on send; just register for streaming text
		const b = ensureUserBubble(msg);
		state.bubbles.set(msg.id, b);
	}
	scrollIfAutoscroll();
}
function onMessageUpdate(evt) {
	const msg = evt?.message;
	if (!msg) return;
	const b = state.bubbles.get(msg.id);
	if (!b) return;
	const ame = evt?.assistantMessageEvent;
	// Preferred: real-time delta stream from pi's internal block events. The
	// partial snapshot mixes thinking+text into one "thinking"-prefixed text
	// part, so render from delta pieces instead of re-rendering the whole part.
	if (ame && typeof ame.delta === "string" && ame.delta.length > 0) {
		if (ame.type === "thinking_delta" || ame.type === "thinking_start") {
			streamThinking(b, msg.id, ame.delta);
		} else if (ame.type === "text_delta" || ame.type === "text_start") {
			streamText(b, ame.delta);
		}
		scrollIfAutoscroll();
		return;
	}
	// Fallback: full-content re-render for events without assistantMessageEvent.
	if (msg.text != null || msg.content != null) {
		renderBubbleContent(b, extractText(msg));
	}
	if (msg.role === "assistant" && state.settings.showThinking) {
		const thinkTxt = extractThinking(msg);
		if (thinkTxt) {
			let tb = state.bubbles.get(`thinking:${msg.id}`);
			if (!tb) {
				tb = makeBubble({ kind: "thinking", name: bubbleLabel("thinking"), body: thinkTxt });
				$("messages").appendChild(tb.wrap);
				state.bubbles.set(`thinking:${msg.id}`, tb);
			} else {
				renderBubbleContent(tb, thinkTxt);
			}
		}
	}
	scrollIfAutoscroll();
}

function streamTextEl(b) {
	if (!b._streamEl) {
		const el = document.createElement("div");
		el.className = "bubble-stream";
		b.content.appendChild(el);
		b._streamEl = el;
	}
	return b._streamEl;
}

function streamText(b, delta) {
	streamTextEl(b).textContent += delta;
}

function streamThinking(b, msgId, delta) {
	if (!state.settings.showThinking) return;
	let tb = state.bubbles.get(`thinking:${msgId}`);
	if (!tb) {
		tb = makeBubble({ kind: "thinking", name: bubbleLabel("thinking"), body: "" });
		$("messages").appendChild(tb.wrap);
		state.bubbles.set(`thinking:${msgId}`, tb);
	}
	streamTextEl(tb).textContent += delta;
}

function clearStreamEls(bubble) {
	if (bubble && bubble._streamEl) {
		bubble._streamEl.remove();
		bubble._streamEl = null;
	}
}
function onMessageEnd(msg) {
	if (!msg) return;
	if (msg.role === "assistant") {
		const b = state.bubbles.get(msg.id);
		if (b) {
			clearStreamEls(b);
			b.wrap.classList.remove("streaming");
			renderBubbleContent(b, extractText(msg));
			b.wrap.dataset.messageId = msg.id;
		}
		const tb = state.bubbles.get(`thinking:${msg.id}`);
		if (tb) clearStreamEls(tb);
		state.streamingMessageId = null;
	}
	scrollIfAutoscroll();
}
function ensureUserBubble(msg) {
	const txt = extractText(msg);
	const b = makeBubble({ kind: "user", name: bubbleLabel("user"), body: txt });
	$("messages").appendChild(b.wrap);
	b.wrap.dataset.messageId = msg.id;
	return b;
}
function toolPreview(evt, entry) {
	// Build a brief one-line summary for the collapsed header: status · name(arg) · result.
	const name = entry.toolName || evt.toolName || "tool";
	const argSrc = evt.tool?.arguments ?? evt.tool?.args ?? evt.args;
	let argText = "";
	if (argSrc && typeof argSrc === "object") {
		const keys = Object.keys(argSrc);
		if (keys.length === 1) {
			const v = argSrc[keys[0]];
			if (typeof v === "string") argText = truncate(v.replace(/\s+/g, " "), 80);
			else if (v != null) argText = truncate(JSON.stringify(v), 80);
		} else if (keys.length > 0) {
			argText = truncate(JSON.stringify(argSrc), 80);
		}
	} else if (typeof argSrc === "string") {
		argText = truncate(argSrc, 80);
	}
	const resultSrc = entry.result || "";
	const resultText = typeof resultSrc === "string" ? truncate(resultSrc.replace(/\s+/g, " "), 120) : "";
	const parts = [];
	if (argText) parts.push(argText);
	if (entry.status === "done") parts.push(`→ ${resultText || "✓"}`);
	else if (entry.status === "error") parts.push(`✕ ${resultText}`);
	return parts.join(" · ");
}
function truncate(s, n) {
	if (!s) return "";
	return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function handleToolEvent(evt) {
	if (!state.settings.showToolCalls) return;
	const id = evt.toolCallId ?? evt.toolCall?.id ?? evt.tool?.id ?? evt.toolName;
	if (!id) return;
	let entry = state.bubbles.get(`tool:${id}`);
	if (!entry && evt.type === "tool_execution_start") {
		entry = makeToolBubble(evt);
		$("messages").appendChild(entry.wrap);
		state.bubbles.set(`tool:${id}`, entry);
	}
	if (!entry) return;
	// Populate tool name from the start so the header is meaningful even before any
	// args/result fields arrive.
	if (evt.toolName && !entry.toolName) entry.toolName = evt.toolName;
	const args = evt.tool?.arguments ?? evt.tool?.args ?? evt.args;
	if (args != null) entry.args = formatArgs(args);
	const partial = evt.partialResult ?? evt.tool?.partialResult;
	if (partial != null && evt.type !== "tool_execution_end") entry.result = formatValue(partial);
	const result = evt.tool?.result ?? evt.result;
	if (result != null && evt.type === "tool_execution_end") entry.result = formatValue(result);
	entry.status = evt.type === "tool_execution_end" ? (evt.isError ? "error" : "done") : "running";
	entry.preview = toolPreview(evt, entry);
	repaintToolBubble(entry);
	scrollIfAutoscroll();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * bubble rendering
 * ────────────────────────────────────────────────────────────────────────────*/
function makeBubble({ kind, name, body, extraClass }) {
// accept string, AgentMessage object, or array of content parts — always normalize to string
const bodyText = typeof body === "string" ? body : extractText(body);
const wrap = document.createElement("div");
wrap.className = `bubble bubble-${kind}`;
	const avatar = document.createElement("div");
	avatar.className = "bubble-avatar";
	avatar.textContent = avatarFor(kind);
	const bd = document.createElement("div");
	bd.className = "bubble-body";
	const meta = document.createElement("div");
	meta.className = "bubble-meta";
	const nm = document.createElement("span");
	nm.className = "bubble-meta-name";
	nm.textContent = name;
	meta.appendChild(nm);
	const ts = document.createElement("span");
	ts.className = "bubble-meta-time";
	ts.textContent = formatTime(Date.now());
	meta.appendChild(ts);
	if (kind === "user" || kind === "assistant") {
		const actions = document.createElement("div");
actions.className = "bubble-actions";
actions.appendChild(makeActionBtn("⧉", "action.copy", () => copyBubble(wrap, bodyText)));
		actions.appendChild(makeActionBtn("↶", "action.fork-here", () => forkFromBubble(wrap)));
		meta.appendChild(actions);
	}
const content = document.createElement("div");
content.className = "bubble-content" + (extraClass ? " " + extraClass : "");
	if (bodyText) {
		if (state.settings.markdown) {
			content.innerHTML = renderMarkdown(bodyText);
		} else {
			content.textContent = bodyText;
		}
	}
	bd.appendChild(content);
wrap.appendChild(avatar);
	wrap.appendChild(bd);
	wrap.addEventListener("contextmenu", (e) => openContextMenu(e, wrap));
	return { wrap, content, meta, body: bd, kind, body_text: bodyText };
}

function makeActionBtn(icon, i18nKey, onClick) {
	const btn = document.createElement("button");
	btn.className = "bubble-action-btn";
	btn.textContent = icon;
	const d = I18N[lang()] || I18N.en;
	btn.title = d[i18nKey] ?? i18nKey;
	btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
	return btn;
}
function makeToolBubble(evt) {
	const wrap = document.createElement("div");
	wrap.className = "bubble bubble-tool";
	const avatar = document.createElement("div");
	avatar.className = "bubble-avatar";
	avatar.textContent = avatarFor("tool");
	const bd = document.createElement("div");
	bd.className = "bubble-body";
	const meta = document.createElement("div");
	meta.className = "bubble-meta";
	const nm = document.createElement("span");
	nm.className = "bubble-meta-name";
	meta.appendChild(nm);
	meta.appendChild(makeActionBtn("⧉", "action.copy-args", () => copyText(wrap.__toolArgs ?? "")));
	bd.appendChild(meta);
	const block = document.createElement("div");
	block.className = "tool-block" + (state.settings.collapseTools ? " collapsed" : "");
	const header = document.createElement("div");
	header.className = "tool-header";
	const headerIcon = document.createElement("span");
	headerIcon.className = "tool-header-icon";
	headerIcon.textContent = "⚙";
	const headerName = document.createElement("span");
	headerName.className = "tool-header-name";
	const headerPreview = document.createElement("span");
	headerPreview.className = "tool-header-preview";
	const headerStatus = document.createElement("span");
	headerStatus.className = "tool-header-status running";
	headerStatus.textContent = "running";
	const toggle = document.createElement("span");
	toggle.className = "tool-toggle";
	toggle.textContent = "▾";
	header.appendChild(headerIcon);
	header.appendChild(headerName);
	header.appendChild(headerPreview);
	header.appendChild(headerStatus);
	header.appendChild(toggle);
	const args = document.createElement("div");
	args.className = "tool-args";
	const output = document.createElement("div");
	output.className = "tool-output";
	header.addEventListener("click", () => block.classList.toggle("collapsed"));
	block.appendChild(header);
	block.appendChild(args);
	block.appendChild(output);
	const actions = document.createElement("div");
	actions.className = "bubble-actions";
	actions.appendChild(makeActionBtn("⧉", "action.copy-output", () => copyText(wrap.__toolResult ?? "")));
	meta.appendChild(actions);
	bd.appendChild(block);
	wrap.appendChild(avatar);
	wrap.appendChild(bd);
	return { wrap, headerName, headerPreview, headerStatus, argsEl: args, outputEl: output, args: "", result: "", status: "running", preview: "" };
}
function repaintToolBubble(b) {
	if (!b.headerName) return;
const name = b.toolName || "tool";
	if (b.headerName) b.headerName.textContent = name;
	if (b.argsEl) {
		if (state.settings.markdown && b.args) b.argsEl.innerHTML = renderMarkdown(b.args);
		else b.argsEl.textContent = b.args || "";
	}
	if (b.outputEl) {
		if (state.settings.markdown && b.result) {
			b.outputEl.innerHTML = renderMarkdown(b.result);
			typesetMath(b.outputEl);
		} else {
			b.outputEl.textContent = b.result || "";
		}
	}
	b.headerStatus.classList.remove("running", "done", "error");
	b.headerStatus.classList.add(b.status);
	b.headerStatus.textContent = b.status;
	if (b.headerPreview) b.headerPreview.textContent = b.preview || "";
	b.wrap.__toolArgs = b.args;
	b.wrap.__toolResult = b.result;
}
function renderBubbleContent(bubble, text) {
	if (!bubble.content) return;
	if (state.settings.markdown) {
		bubble.content.innerHTML = renderMarkdown(text);
		typesetMath(bubble.content);
	} else {
		bubble.content.textContent = text;
	}
	bubble.body_text = text;
}

let _mathTimer = null;

function typesetMath(root) {
	if (!root) return;
	clearTimeout(_mathTimer);
	_mathTimer = setTimeout(() => {
		(async () => {
			// 等 MathJax 就绪(异步加载,可能初次调用时还没好)
			const start = Date.now();
			while ((!window.MathJax || typeof window.MathJax.typesetPromise !== "function") && Date.now() - start < 5000) {
				await new Promise((r) => setTimeout(r, 100));
			}
			if (!window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
			try { await window.MathJax.typesetPromise([root]); } catch (err) { /* ignore */ }
		})();
	}, 250);
}
function avatarFor(kind) {
	switch (kind) {
		case "user": return lang() === "zh" ? "你" : "U";
		case "assistant": return "π";
		case "tool": return "⚙";
		case "system": return "ℹ";
		case "thinking": return "💭";
		case "command": return "›";
		case "error": return "✕";
		default: return "?";
	}
}
function bubbleLabel(kind) {
	const d = I18N[lang()] || I18N.en;
	return d[`bubble.${kind}`] ?? kind;
}

function renderCommandBubble(text) {
	const b = makeBubble({ kind: "command", name: "cmd", body: text });
	$("messages").appendChild(b.wrap);
	state.bubbles.set(text, b);
	return b;
}
function formatArgs(args) {
	if (args === undefined || args === null) return "";
	try { return typeof args === "string" ? args : JSON.stringify(args, null, 2); }
	catch { return String(args); }
}
function formatValue(v) {
	// Used for tool results: same JSON treatment as formatArgs, but handles
	// ToolResult { content: TextContent[], details: ... } shapes by extracting text parts.
	if (v === undefined || v === null) return "";
	if (typeof v === "string") return v;
	if (Array.isArray(v)) {
		// Content-part array: [{type:"text", text:"..."}]
		const texts = v.filter(p => p && p.type === "text" && typeof p.text === "string").map(p => p.text);
		if (texts.length) return texts.join("\n");
	}
	if (typeof v === "object") {
		// ToolResult shape: { content: [...], details: {...} }
		if (Array.isArray(v.content)) {
			const c = formatValue(v.content);
			if (c) return v.details ? `${c}\n\n${formatValue(v.details)}` : c;
		}
		return formatArgs(v);
	}
	return String(v);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Markdown (lightweight, no external deps)
 * ────────────────────────────────────────────────────────────────────────────*/
function renderMarkdown(text) {
	if (!text) return "";
	let s = escapeHtml(text);
	// GFM pipe tables — before code fences so ``` blocks stay intact.
	s = s.replace(/(^\|.*\|\s*\n\|[\s:|-]+\|\s*\n(?:^\|.*\|\s*\n?)+)/gm, (block) => {
		const lines = block.trim().split("\n");
		const split = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
		const head = split(lines[0]).map((c) => `<th>${c}</th>`).join("");
		const body = lines.slice(2).map((l) => `<tr>${split(l).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
		return `<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
	});
	s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
	s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
	s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
	s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
	s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");
	s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
	s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
	s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
	s = s.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
	s = s.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
	s = s.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
	s = s.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
	s = s.replace(/\n\n+/g, "</p><p>");
	s = s.replace(/^/, "<p>").replace(/$/, "</p>");
	s = s.replace(/<p>(<h[1-3]>|<ul>|<\/ul>|<pre>|<\/pre>|<blockquote>|<\/blockquote>)/g, "$1");
	s = s.replace(/(<\/h[1-3]>|<\/ul>|<\/pre>|<\/blockquote>)<\/p>/g, "$1");
	return s;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * snapshot rendering
 * ────────────────────────────────────────────────────────────────────────────*/
function pbToken(n) {
	if (n == null) return "";
	if (n < 1000) return String(n);
	if (n < 10000) return (n / 1000).toFixed(1) + "k";
	if (n < 1000000) return String(Math.round(n / 1000)) + "k";
	if (n < 10000000) return (n / 1000000).toFixed(1) + "M";
	return String(Math.round(n / 1000000)) + "M";
}
function pbLevel(pct) { return pct > 80 ? "lv-error" : pct > 60 ? "lv-warn" : ""; }
function renderPowerbar() {
	const snap = state.snapshot;
	const pb = snap?.powerbar;
	// git branch
	const gitEl = $("pb-git");
	if (pb?.gitBranch) {
		gitEl.hidden = false;
		gitEl.textContent = `⎇ ${pb.gitBranch}`;
	} else {
		gitEl.hidden = true;
	}
	// context usage
	const ctxEl = $("pb-context");
	if (pb?.context && pb.context.window > 0) {
		ctxEl.hidden = false;
		const lv = pbLevel(pb.context.pct);
		ctxEl.className = "pb-seg pb-context " + lv;
		ctxEl.innerHTML = `ctx <span class="pb-bar"><i style="width:${Math.min(100, pb.context.pct)}%"></i></span> ${pb.context.pct}%`;
	} else {
		ctxEl.hidden = true;
	}
	// tokens
	const tokEl = $("pb-tokens");
	if (pb?.tokens) {
		tokEl.hidden = false;
		const t = pb.tokens;
		const parts = [`↑${pbToken(t.input)}`, `↓${pbToken(t.output)}`];
		if (t.cacheRead > 0) parts.push(`R${pbToken(t.cacheRead)}`);
		if (t.cacheWrite > 0) parts.push(`W${pbToken(t.cacheWrite)}`);
		if ((t.cacheRead > 0 || t.cacheWrite > 0) && t.cacheHitRate != null) parts.push(`CH${t.cacheHitRate.toFixed(1)}%`);
		if (t.cost > 0) parts.push(`$${t.cost.toFixed(2)}`);
		tokEl.textContent = parts.join(" ");
	} else {
		tokEl.hidden = true;
	}
	// subscription usage
	const subEl = $("pb-sub");
	if (pb?.sub && pb.sub.windows?.length) {
		subEl.hidden = false;
		const w = pb.sub.windows[0];
		const pct = Math.round(w.usedPercent ?? 0);
		const lv = pbLevel(pct);
		subEl.className = "pb-seg pb-sub " + lv;
		const label = w.label ? w.label + " " : "";
		const reset = w.resetDescription ? " " + w.resetDescription : "";
		subEl.innerHTML = `${label}<span class="pb-bar"><i style="width:${Math.min(100, pct)}%"></i></span> ${pct}%${escapeHtml(reset)}`;
	} else {
		subEl.hidden = true;
	}
	// model · thinking
	const modelEl = $("pb-model");
	const model = snap?.model;
	const mid = model?.id ?? model?.modelId ?? model?.name;
	const provider = model?.provider ?? model?.providerName;
	const think = snap?.thinkingLevel;
	if (mid) {
		modelEl.hidden = false;
		let txt = mid;
		if (think && think !== "off") txt += ` · ${think}`;
		if (provider) txt += ` · ${provider}`;
		modelEl.textContent = txt;
	} else {
		modelEl.hidden = true;
	}
}
function renderSnapshot() {
	const snap = state.snapshot;
	if (!snap) return;
	if (snap.mode) $("mode").textContent = snap.mode;
	if (snap.cwd) {
		$("cwd-row").hidden = false;
		$("cwd").textContent = snap.cwd;
	}
	renderModelSelect();
	renderThinkingSelect();
	renderToolsList();
	renderCommandsList();
	renderSessionName();
	renderTreeList();
	updateAbortButton();
	updateEmptyState();
	renderPowerbar();
}
function renderModelSelect() {
	const sel = $("model");
	const snap = state.snapshot;
	sel.innerHTML = "";
	let models = snap?.scopedModels || snap?.availableModels || snap?.models || [];
	// Fallback: if scopedModels is empty but a current model is set, show the current model as a single option.
	if (!models.length && snap?.model) models = [snap.model];
	const d = I18N[lang()] || I18N.en;
	if (!models.length) {
		const opt = document.createElement("option");
		opt.value = "";
		opt.textContent = d["select.empty"];
		sel.appendChild(opt);
		return;
	}
	const current = snap.model?.id ?? snap.model?.modelId ?? snap.model?.name;
for (const m of models) {
		const provider = m.provider ?? "";
		const mid = m.id ?? m.modelId ?? m.name;
		const opt = document.createElement("option");
		opt.value = provider ? `${provider}::${mid}` : mid;
		opt.dataset.provider = provider;
		opt.dataset.modelId = mid;
		opt.textContent = m.label ?? m.name ?? m.id ?? m.modelId;
		opt.title = `${provider} · ${mid}`;
		if (current && mid === current) opt.selected = true;
		sel.appendChild(opt);
	}
}
function renderThinkingSelect() {
	const sel = $("thinking");
	const snap = state.snapshot;
	const current = snap?.thinkingLevel;
	const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
	sel.innerHTML = "";
	if (current && !levels.includes(current)) levels.unshift(current);
	for (const lv of levels) {
		const opt = document.createElement("option");
		opt.value = lv;
		opt.textContent = lv;
		if (lv === current) opt.selected = true;
		sel.appendChild(opt);
	}
}
function renderToolsList() {
	const wrap = $("tools-list");
	const snap = state.snapshot;
	wrap.innerHTML = "";
	const all = snap?.allTools ?? [];
	const active = new Set(snap?.activeTools ?? []);
	const d = I18N[lang()] || I18N.en;
	let activeCount = 0;
	if (!all.length) {
		wrap.innerHTML = `<div class="empty-state">—</div>`;
	} else {
		for (const t of all) {
			const chip = document.createElement("button");
			chip.className = "tool-chip" + (active.has(t.name) ? " active" : "");
			chip.title = t.description ?? t.name;
			chip.innerHTML = `<span class="tool-chip-name">${escapeHtml(t.name)}</span>`;
			chip.addEventListener("click", async () => {
				const newActive = new Set(active);
				if (newActive.has(t.name)) newActive.delete(t.name);
				else newActive.add(t.name);
				try {
					await request("set_active_tools", { tools: [...newActive] });
					if (state.snapshot) state.snapshot.activeTools = [...newActive];
					renderToolsList();
				} catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
			});
			wrap.appendChild(chip);
			if (active.has(t.name)) activeCount++;
		}
	}
	$("active-tool-count").textContent = String(activeCount);
	$("total-tool-count").textContent = String(all.length);
}
function renderCommandsList() {
	const wrap = $("commands-list");
	wrap.innerHTML = "";
	const cmds = state.snapshot?.commands ?? [];
	const d = I18N[lang()] || I18N.en;
	if (!cmds.length) { wrap.innerHTML = `<div class="empty-state">—</div>`; return; }
	for (const c of cmds) {
		const row = document.createElement("button");
		row.className = "command-row";
		row.innerHTML = `<span class="command-row-name">/${escapeHtml(c.name)}</span><span class="command-row-desc">${escapeHtml(d[`cmd.${c.name}`] ?? c.description ?? "")}</span>`;
		row.addEventListener("click", () => runSlashCommand(`/${c.name}`));
		wrap.appendChild(row);
	}
}
function renderSessionName() {
	$("session-name").value = state.snapshot?.sessionName ?? "";
}
function renderTreeList() {
	const list = $("tree-list");
	list.innerHTML = "";
	const entries = state.snapshot?.tree ?? state.snapshot?.entries ?? [];
	const d = I18N[lang()] || I18N.en;
	if (!entries.length) {
		list.innerHTML = `<div class="empty-state">${d["history.empty"]}</div>`;
		return;
	}
	for (const e of entries) {
		const row = document.createElement("div");
		const isLeaf = e.id === state.snapshot?.leafId;
		row.className = `tree-row ${isLeaf ? "active" : ""} ${e.isFork ? "tree-row-fork" : "tree-row-leaf"}`;
		row.title = e.label ?? e.id;
		const lbl = document.createElement("span");
		lbl.className = "tree-row-label";
		lbl.textContent = e.label ?? e.id;
		row.appendChild(lbl);
		if (e.timestamp) {
			const t = document.createElement("span");
			t.className = "tree-row-time";
			t.textContent = formatTime(e.timestamp);
			row.appendChild(t);
		}
		row.addEventListener("click", async () => {
			try { await request("navigate_tree", { id: e.id }); }
			catch (err) { notify(tpl(d["msg.error"], { error: err.message }), "warn"); }
		});
		list.appendChild(row);
	}
}
function updateAbortButton() {
	$("abort").disabled = state.mode !== "busy";
}
function updateEmptyState() {
	const has = $("messages").children.length > 0;
	$("empty-state").classList.toggle("hidden", has);
}
function updateComposerHint() {
	const d = I18N[lang()] || I18N.en;
	const hint = $("composer-hint");
	if (!state.connected) hint.textContent = d["composer.hint-disabled"];
	else if (state.mode === "busy") hint.textContent = d["composer.hint-busy"];
	else hint.textContent = d["composer.hint-idle"];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * initial message replay (from snapshot)
 * ────────────────────────────────────────────────────────────────────────────*/
function hasToolCalls(m) {
	const c = m?.content;
	return Array.isArray(c) && c.some((p) => p && (p.type === "toolCall" || p.type === "tool_call") && p.name);
}

function makeReplayToolBubble(part) {
	const b = makeToolBubble({ type: "tool_execution_start", toolName: part.name, tool: { id: part.id, arguments: part.arguments } });
	b.toolName = part.name;
	b.status = "done";
	b.args = part.arguments != null ? formatArgs(part.arguments) : "";
	b.preview = "";
	repaintToolBubble(b);
	return b;
}

function replayInitialMessages(messages) {
	// Drop empty assistant messages (they only carry tool calls, no user-visible text).
	const filtered = (messages || []).filter((m) => {
		if (!m) return false;
		if (m.role === "user") return true;
		if (m.role === "assistant") return Boolean(extractText(m)) || hasToolCalls(m);
		return false;
	});
	// Cap to most-recent N to keep DOM light on long sessions.
	const MAX = 60;
	const skipped = Math.max(0, filtered.length - MAX);
	const slice = filtered.slice(-MAX);
	state.messagesSkipped = skipped;
	state.oldestMessageId = slice[0]?.id ?? "";
	const container = $("messages");
	if (skipped > 0) {
		const notice = document.createElement("div");
		notice.className = "load-earlier";
		notice.dataset.action = "load-earlier";
		notice.textContent = `↑ ${skipped} earlier messages — click to load`;
		container.appendChild(notice);
	}
	for (const m of slice) {
		const txt = extractText(m);
		const b = makeBubble({
			kind: m.role === "user" ? "user" : "assistant",
			name: bubbleLabel(m.role),
			body: txt,
		});
		container.appendChild(b.wrap);
		b.wrap.dataset.messageId = m.id ?? "";
		if (m.id) state.bubbles.set(m.id, b);
		// Render tool-call parts carried by assistant messages so tools survive a refresh.
		if (m.role === "assistant" && Array.isArray(m.content)) {
			for (const p of m.content) {
				if (p && (p.type === "toolCall" || p.type === "tool_call") && p.name) {
					container.appendChild(makeReplayToolBubble(p).wrap);
				}
			}
		}
	}
	updateEmptyState();
	scrollMessagesDown(true);
}

async function loadEarlierMessages() {
	if (state.loadingEarlier) return;
	const before = state.oldestMessageId;
	if (!before) return;
	state.loadingEarlier = true;
	const notice = document.querySelector(".load-earlier");
	if (notice) notice.textContent = "Loading…";
	try {
		const res = await request("get_messages", { before, limit: 60 });
		const older = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
		if (!older.length) {
			state.oldestMessageId = "";
			if (notice) notice.remove();
			return;
		}
		const container = $("messages");
		const prevHeight = container.scrollHeight;
		const toRender = older.filter((m) => {
			if (!m) return false;
			if (m.role === "user") return true;
			if (m.role === "assistant") return Boolean(extractText(m)) || hasToolCalls(m);
			return false;
		});
		const frag = document.createDocumentFragment();
		for (const m of toRender) {
			const txt = extractText(m);
			const b = makeBubble({
				kind: m.role === "user" ? "user" : "assistant",
				name: bubbleLabel(m.role),
				body: txt,
			});
			frag.appendChild(b.wrap);
			b.wrap.dataset.messageId = m.id ?? "";
			if (m.id) state.bubbles.set(m.id, b);
			if (m.role === "assistant" && Array.isArray(m.content)) {
				for (const p of m.content) {
					if (p && (p.type === "toolCall" || p.type === "tool_call") && p.name) {
						frag.appendChild(makeReplayToolBubble(p).wrap);
					}
				}
			}
		}
		const existingNotice = container.querySelector(".load-earlier");
		if (existingNotice) container.insertBefore(frag, existingNotice);
		else container.insertBefore(frag, container.firstChild);
		state.oldestMessageId = toRender[0]?.id ?? state.oldestMessageId;
		state.messagesSkipped = Math.max(0, (state.messagesSkipped ?? 0) - toRender.length);
		if (notice) {
			if (state.messagesSkipped > 0) {
				notice.textContent = `↑ ${state.messagesSkipped} earlier messages — click to load`;
			} else {
				notice.remove();
			}
		}
		// Preserve scroll position: scroll up by the new height so the user doesn't jump.
		container.scrollTop = container.scrollHeight - prevHeight;
	} finally {
		state.loadingEarlier = false;
	}
}
/* ─────────────────────────────────────────────────────────────────────────────
 * composer + send / steer / follow_up
 * ────────────────────────────────────────────────────────────────────────────*/
async function send(mode) {
	const composer = $("composer");
	const text = composer.value;
if (!text && state.imageAttachments.length === 0) {
		notify(I18N[lang()]?.["msg.no-content"] ?? "Type something first", "warn");
		return;
	}
	// Bridge expects { message, images: [{data, mimeType}], streamingBehavior }.
	const payload = { message: text, images: [] };
	for (const att of state.imageAttachments) {
		const m = att.dataUrl.match(/^data:([^;]+);base64,(.*)$/);
		if (m) payload.images.push({ data: m[2], mimeType: m[1] });
	}
	state.imageAttachments = [];
	renderImagePreview();
	try {
		const action = mode === "steer" ? "steer" : mode === "follow_up" ? "follow_up" : "prompt";
		await request(action, payload);
		// Slash commands don't emit user message_start (pi routes them to its
		// command handler and returns early), so render a command bubble here.
		if (text.startsWith("/")) renderCommandBubble(text);
		if (text) pushHistory(text);
		clearComposer();
		scrollIfAutoscroll();
		updateEmptyState();
	} catch (e) {
		notify(tpl(I18N[lang()]?.["msg.error"] ?? "Error: {error}", { error: e.message }), "error", 6000);
	}
}
function clearComposer() {
	$("composer").value = "";
state.imageAttachments = [];
	renderImagePreview();
	autoSizeComposer();
}
function autoSizeComposer() {
	const c = $("composer");
	c.style.height = "auto";
	c.style.height = Math.min(c.scrollHeight, 240) + "px";
}

/* ─────────────────────────────────────────────────────────────────────────────
 * image attach
 * ────────────────────────────────────────────────────────────────────────────*/
function renderImagePreview() {
	const wrap = $("image-preview");
	wrap.innerHTML = "";
	if (state.imageAttachments.length === 0) { wrap.classList.add("hidden"); return; }
	wrap.classList.remove("hidden");
	state.imageAttachments.forEach((att, i) => {
		const item = document.createElement("div");
		item.className = "image-preview-item";
		const img = document.createElement("img");
		img.src = att.dataUrl;
		img.title = att.name;
		item.appendChild(img);
		const btn = document.createElement("button");
		btn.className = "icon-btn";
		btn.textContent = "✕";
		btn.title = "Remove";
		btn.addEventListener("click", () => removeImageAt(i));
		item.appendChild(btn);
		wrap.appendChild(item);
	});
}
function removeImageAt(i) {
	state.imageAttachments.splice(i, 1);
	renderImagePreview();
}
async function attachImage(file) {
	// Reject non-image files; surface a friendly warning.
	if (!file || !file.type || !file.type.startsWith("image/")) {
		notify(`"${file?.name ?? "file"}" is not an image (${file?.type || "unknown"}); only image/* can be attached.`, "warn", 3000);
		return;
	}
	const dataUrl = await new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result);
		r.onerror = reject;
		r.readAsDataURL(file);
	});
	state.imageAttachments.push({ dataUrl: dataUrl, name: file.name || "image", size: file.size });
	renderImagePreview();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * copy / fork-from-here
 * ────────────────────────────────────────────────────────────────────────────*/
async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text ?? "");
		const d = I18N[lang()] || I18N.en;
		notify(d["msg.copied"], "success", 1500);
	} catch (e) {
		notify(tpl(I18N[lang()]?.["msg.error"], { error: e.message }), "error");
	}
}
async function copyBubble(wrap, fallback) {
	const content = wrap.querySelector(".bubble-content");
	await copyText(content?.innerText ?? fallback ?? "");
}
async function forkFromBubble(wrap) {
	try { await request("fork", { id: wrap.dataset.messageId ?? null }); }
	catch (e) { notify(tpl(I18N[lang()]?.["msg.error"], { error: e.message }), "error"); }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * scroll & autoscroll
 * ────────────────────────────────────────────────────────────────────────────*/
function scrollIfAutoscroll() {
	if (state.autoscroll) scrollMessagesDown();
}
function scrollMessagesDown(force) {
	const el = $("messages");
	const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
	if (!atBottom && !force) {
		$("scroll-down").classList.remove("hidden");
		return;
	}
	el.scrollTop = el.scrollHeight;
	$("scroll-down").classList.add("hidden");
}
function updateAutoscrollIndicator() {
	const el = $("autoscroll-indicator");
	el.classList.toggle("hidden", state.autoscroll);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * slash command menu (autocomplete in composer)
 * ────────────────────────────────────────────────────────────────────────────*/
function runSlashCommand(raw) {
	const m = (raw || "").trim().match(/^\/([\w-]+)(?:\s+(.*))?$/);
	if (!m) return false;
	const [, cmdName, rest] = m;
	const d = I18N[lang()] || I18N.en;
	switch (cmdName) {
		case "new": newSession(); return true;
		case "fork": forkLast(); return true;
		case "compact": compact(); return true;
		case "reload": reload(); return true;
		case "name": promptText(d["session-ops.rename"], "rename", (val) => setSessionName(val)).then(() => true).catch(() => true); return true;
		case "export": exportSession(); return true;
		case "model": promptText(d["label.model"], "model id", (val) => setModel(val)).then(() => true).catch(() => true); return true;
		case "thinking": promptText(d["label.thinking"], "off | low | medium | high", (val) => setThinking(val)).then(() => true).catch(() => true); return true;
		case "theme": toggleTheme(); return true;
		case "lang": toggleLang(); return true;
		case "help": openHelp(); return true;
		case "settings": openSettings(); return true;
		case "abort": abort(); return true;
		case "context": openContextDialog(); return true;
		case "reconnect": connect(); return true;
		default: return false;
	}
}
function openSlashMenu(filter) {
	const menu = $("slash-menu");
	const commands = state.snapshot?.commands ?? [];
	const all = [
		{ name: "new", description: I18N[lang()]?.["cmd.new"] },
		{ name: "fork", description: I18N[lang()]?.["cmd.fork"] },
		{ name: "compact", description: I18N[lang()]?.["cmd.compact"] },
		{ name: "reload", description: I18N[lang()]?.["cmd.reload"] },
		{ name: "name", description: I18N[lang()]?.["cmd.name"] },
		{ name: "export", description: I18N[lang()]?.["cmd.export"] },
		{ name: "model", description: I18N[lang()]?.["cmd.model"] },
		{ name: "thinking", description: I18N[lang()]?.["cmd.thinking"] },
		{ name: "theme", description: I18N[lang()]?.["cmd.theme"] },
		{ name: "lang", description: I18N[lang()]?.["cmd.lang"] },
		{ name: "help", description: I18N[lang()]?.["cmd.help"] },
		{ name: "context", description: I18N[lang()]?.["cmd.context"] },
		{ name: "abort", description: I18N[lang()]?.["cmd.abort"] },
	];
	// union with pi extension commands
	const seen = new Set(all.map((c) => c.name));
	for (const c of commands) {
		const n = c.name?.replace(/^\//, "");
		if (!seen.has(n)) { all.push({ name: n, description: c.description }); seen.add(n); }
	}
	const f = (filter || "").replace(/^\//, "").toLowerCase();
	const matches = all.filter((c) => !f || c.name.toLowerCase().includes(f));
	state.slashMenuMatches = matches.slice(0, 20);
	state.slashMenuIndex = 0;
	state.slashMenuOpen = state.slashMenuMatches.length > 0;
	renderSlashMenu();
}
function renderSlashMenu() {
	const menu = $("slash-menu");
	const matches = state.slashMenuMatches;
	if (!state.slashMenuOpen || !matches.length) {
		menu.classList.add("hidden");
		return;
	}
	menu.classList.remove("hidden");
	menu.innerHTML = "";
	for (let i = 0; i < matches.length; i++) {
		const m = matches[i];
		const item = document.createElement("div");
		item.className = "slash-menu-item" + (i === state.slashMenuIndex ? " selected" : "");
		item.innerHTML = `<span class="slash-menu-item-name">/${escapeHtml(m.name)}</span><span class="slash-menu-item-desc">${escapeHtml(m.description ?? "")}</span>`;
		item.addEventListener("click", () => selectSlashItem(i));
		item.addEventListener("mousemove", () => {
			if (state.slashMenuIndex !== i) { state.slashMenuIndex = i; renderSlashMenu(); }
		});
		menu.appendChild(item);
	}
}
function closeSlashMenu() {
	state.slashMenuOpen = false;
	state.slashMenuMatches = [];
	state.slashMenuIndex = 0;
	renderSlashMenu();
}
function selectSlashItem(i) {
	const m = state.slashMenuMatches[i];
	if (!m) return;
	const composer = $("composer");
	composer.value = `/${m.name} `;
	composer.focus();
	closeSlashMenu();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * command palette (Ctrl+K)
 * ────────────────────────────────────────────────────────────────────────────*/
function openPalette() {
	if (state.paletteOpen) return;
	state.paletteOpen = true;
	const back = document.createElement("div");
	back.className = "palette-backdrop";
	back.id = "palette-backdrop";
	const pal = document.createElement("div");
	pal.className = "palette";
	pal.innerHTML = `
		<input id="palette-input" class="palette-input" placeholder="${escapeHtml(I18N[lang()]?.["palette.placeholder"] ?? "")}" autocomplete="off" />
		<div id="palette-list" class="palette-list"></div>
	`;
	back.appendChild(pal);
	document.body.appendChild(back);
	back.addEventListener("click", (e) => { if (e.target === back) closePalette(); });
	const input = pal.querySelector("#palette-input");
	input.addEventListener("input", () => renderPaletteList(input.value));
	input.addEventListener("keydown", (e) => handlePaletteKey(e));
	renderPaletteList("");
	input.focus();
}
function closePalette() {
	state.paletteOpen = false;
	$("palette-backdrop")?.remove();
}
function getPaletteItems(filter) {
	const d = I18N[lang()] || I18N.en;
	const all = [
		{ cat: "session", name: "New session", cmd: "new", desc: d["cmd.new"] },
		{ cat: "session", name: "Fork", cmd: "fork", desc: d["cmd.fork"] },
		{ cat: "session", name: "Compact", cmd: "compact", desc: d["cmd.compact"] },
		{ cat: "session", name: "Reload", cmd: "reload", desc: d["cmd.reload"] },
		{ cat: "session", name: "Rename…", cmd: "name", desc: d["cmd.name"] },
		{ cat: "session", name: "Export", cmd: "export", desc: d["cmd.export"] },
		{ cat: "agent", name: "Change model…", cmd: "model", desc: d["cmd.model"] },
		{ cat: "agent", name: "Change thinking…", cmd: "thinking", desc: d["cmd.thinking"] },
		{ cat: "agent", name: "Cycle thinking", cmd: "cycle-thinking", desc: d["cmd.thinking"] },
		{ cat: "ui", name: "Toggle theme", cmd: "theme", desc: d["cmd.theme"] },
		{ cat: "ui", name: "Toggle language", cmd: "lang", desc: d["cmd.lang"] },
		{ cat: "ui", name: "Keyboard shortcuts", cmd: "help", desc: d["cmd.help"] },
		{ cat: "ui", name: "Settings", cmd: "settings", desc: d["cmd.settings"] },
		{ cat: "ui", name: "Context usage", cmd: "context", desc: d["cmd.context"] },
		{ cat: "conn", name: "Abort current turn", cmd: "abort", desc: d["cmd.abort"] },
		{ cat: "conn", name: "Disconnect", cmd: "disconnect", desc: d["cmd.disconnect"] },
		{ cat: "conn", name: "Reconnect", cmd: "reconnect", desc: d["cmd.reconnect"] },
	];
	// Add model picker entries
	for (const m of (state.snapshot?.scopedModels ?? state.snapshot?.availableModels ?? state.snapshot?.models ?? [])) {
all.push({ cat: "models", name: m.label ?? m.name ?? m.id, cmd: "model-select", payload: { provider: m.provider ?? "", id: m.id ?? m.modelId ?? m.name }, desc: `${m.provider ?? ""} · ${m.id ?? m.modelId}` });
	}
	// Add tool toggles
	for (const t of (state.snapshot?.allTools ?? [])) {
		all.push({ cat: "tools", name: `Toggle ${t.name}`, cmd: "toggle-tool", payload: t.name, desc: t.description ?? "" });
	}
	// Pi extension slash commands
	for (const c of (state.snapshot?.commands ?? [])) {
		all.push({ cat: "extension", name: `/${c.name}`, cmd: "slash", payload: c.name, desc: c.description ?? "" });
	}
	const f = (filter || "").toLowerCase();
	if (!f) return all;
	return all.filter((x) => x.name.toLowerCase().includes(f) || x.cmd.toLowerCase().includes(f) || (x.desc ?? "").toLowerCase().includes(f));
}
let paletteIndex = 0;
function renderPaletteList(filter) {
	const list = $("palette-list");
	if (!list) return;
	const items = getPaletteItems(filter);
	paletteIndex = Math.min(paletteIndex, Math.max(0, items.length - 1));
	if (!items.length) {
		list.innerHTML = `<div class="palette-empty">${escapeHtml(I18N[lang()]?.["palette.empty"] ?? "No matches")}</div>`;
		return;
	}
	list.innerHTML = "";
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		const row = document.createElement("div");
		row.className = "palette-item" + (i === paletteIndex ? " selected" : "");
		row.innerHTML = `<span class="palette-item-cat">${escapeHtml(it.cat)}</span><span class="palette-item-name">${escapeHtml(it.name)}</span><span class="palette-item-desc">${escapeHtml(it.desc ?? "")}</span>`;
		row.addEventListener("click", () => runPaletteItem(it));
		row.addEventListener("mousemove", () => { if (paletteIndex !== i) { paletteIndex = i; renderPaletteList(filter); } });
		list.appendChild(row);
	}
}
function handlePaletteKey(e) {
	const items = getPaletteItems($("palette-input")?.value ?? "");
	if (e.key === "ArrowDown") { e.preventDefault(); paletteIndex = Math.min(items.length - 1, paletteIndex + 1); renderPaletteList($("palette-input").value); }
	else if (e.key === "ArrowUp") { e.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); renderPaletteList($("palette-input").value); }
	else if (e.key === "Enter") { e.preventDefault(); if (items[paletteIndex]) runPaletteItem(items[paletteIndex]); }
	else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
}
async function runPaletteItem(it) {
	closePalette();
	switch (it.cmd) {
		case "new": return newSession();
		case "fork": return forkLast();
		case "compact": return compact();
		case "reload": return reload();
		case "name": {
			const name = await promptText("session name", "");
			if (name != null) return setSessionName(name);
			return;
		}
		case "export": return exportSession();
		case "model": {
			const id = await promptText("model", "");
			if (id != null) return setModel(id);
			return;
		}
		case "model-select": return setModel(it.payload);
		case "thinking": {
			const lv = await promptText("thinking level", "");
			if (lv != null) return setThinking(lv);
			return;
		}
		case "cycle-thinking": return cycleThinking();
		case "toggle-tool": {
			const active = new Set(state.snapshot?.activeTools ?? []);
			if (active.has(it.payload)) active.delete(it.payload);
			else active.add(it.payload);
			try {
				await request("set_active_tools", { tools: [...active] });
				if (state.snapshot) state.snapshot.activeTools = [...active];
				renderToolsList();
			} catch (e) { notify(tpl(I18N[lang()]?.["msg.error"], { error: e.message }), "error"); }
			return;
		}
		case "slash": return runSlashCommand(`/${it.payload}`);
		case "theme": return toggleTheme();
		case "lang": return toggleLang();
		case "help": return openHelp();
		case "settings": return openSettings();
		case "context": return openContextDialog();
		case "abort": return abort();
		case "disconnect": state.ws?.close(); return;
		case "reconnect": return connect();
	}
}

/* ─────────────────────────────────────────────────────────────────────────────
 * prompt dialog
 * ────────────────────────────────────────────────────────────────────────────*/
function promptText(title, placeholder, onOk) {
	return new Promise((resolve) => {
		const d = I18N[lang()] || I18N.en;
		const dl = $("prompt-dialog");
		$("prompt-title").textContent = title;
		$("prompt-description").textContent = "";
		const inp = $("prompt-input");
		inp.value = "";
		inp.placeholder = placeholder ?? "";
		const err = $("prompt-error");
		err.classList.add("hidden");
		err.textContent = "";
		dl.classList.remove("hidden");
		setTimeout(() => inp.focus(), 30);
		const finish = (val) => {
			dl.classList.add("hidden");
			inp.removeEventListener("keydown", onKey);
			$("prompt-ok").removeEventListener("click", onOkBtn);
			$("prompt-cancel").removeEventListener("click", onCancel);
			resolve(val);
			if (val != null && onOk) Promise.resolve(onOk(val)).catch(() => {});
		};
		const onKey = (e) => {
			if (e.key === "Enter") { e.preventDefault(); finish(inp.value.trim()); }
			else if (e.key === "Escape") { e.preventDefault(); finish(null); }
		};
		const onOkBtn = () => finish(inp.value.trim());
		const onCancel = () => finish(null);
		inp.addEventListener("keydown", onKey);
		$("prompt-ok").addEventListener("click", onOkBtn);
		$("prompt-cancel").addEventListener("click", onCancel);
	});
}

/* ─────────────────────────────────────────────────────────────────────────────
 * help dialog (F1)
 * ────────────────────────────────────────────────────────────────────────────*/
const HELP_SHORTCUTS = [
	[["Enter"], "send message"],
	[["Shift", "Enter"], "newline in composer"],
	[["Ctrl", "."], "steer mid-turn"],
	[["Ctrl", "Shift", "Enter"], "follow up after turn"],
	[["Ctrl", "T"], "cycle thinking level"],
	[["Ctrl", "U"], "attach image"],
	[["Ctrl", "K"], "command palette"],
	[["Esc"], "abort current turn / close dialog"],
	[["F1"], "this help"],
	[["↑ / ↓"], "navigate slash menu / palette"],
];
function openHelp() {
	const dlg = $("help-dialog");
	dlg.classList.remove("hidden");
	const body = $("help-body");
	body.innerHTML = "";
	for (const [keys, desc] of HELP_SHORTCUTS) {
		const dt = document.createElement("dt");
		for (let i = 0; i < keys.length; i++) {
			if (i > 0) dt.append(" + ");
			const k = document.createElement("kbd");
			k.textContent = keys[i];
			dt.appendChild(k);
		}
		const dd = document.createElement("dd");
		dd.textContent = desc;
		body.appendChild(dt);
		body.appendChild(dd);
	}
	$("help-close").focus();
}
function closeHelp() { $("help-dialog").classList.add("hidden"); }

/* ─────────────────────────────────────────────────────────────────────────────
 * context dialog (mirrors TUI `/context`)
 * ────────────────────────────────────────────────────────────────────────────*/
let contextData = null;
let contextTab = "usage";

async function openContextDialog() {
	const d = I18N[lang()] || I18N.en;
	$("context-usage-body").innerHTML = `<div class="context-loading">${d["context.loading"]}</div>`;
	$("context-injections-body").classList.add("hidden");
	$("context-usage-body").classList.remove("hidden");
	contextTab = "usage";
	setContextTab("usage");
	$("context-dialog").classList.remove("hidden");
	$("context-error").classList.add("hidden");
	await refreshContextView();
}

function closeContextDialog() { $("context-dialog").classList.add("hidden"); }

/* ─────────────────────────────────────────────────────────────────────────────
 * ask_user_question dialog (mirrors TUI questionnaire)
 * ────────────────────────────────────────────────────────────────────────────*/
let askData = null; // { toolCallId, questions }

function openAskDialog(evt) {
	const d = I18N[lang()] || I18N.en;
	const questions = evt?.questions ?? [];
	const toolCallId = evt?.toolCallId ?? "";
	if (!questions.length || !toolCallId) {
		closeAskDialog(true);
		return;
	}
	askData = { toolCallId, questions };
	renderAskQuestions();
	$("ask-dialog").classList.remove("hidden");
	$("ask-error").classList.add("hidden");
	const first = $("ask-body").querySelector("input[type=radio], input[type=checkbox]");
	if (first) first.focus();
}

function renderAskQuestions() {
	const d = I18N[lang()] || I18N.en;
	const body = $("ask-body");
	const qs = askData.questions;
	body.innerHTML = "";
	qs.forEach((q, qi) => {
		const wrap = document.createElement("div");
		wrap.className = "ask-question";
		const head = document.createElement("div");
		head.className = "ask-qhead";
		if (q.header) {
			const chip = document.createElement("span");
			chip.className = "ask-chip";
			chip.textContent = q.header;
			head.appendChild(chip);
		}
		const text = document.createElement("span");
		text.className = "ask-qtext";
		text.textContent = q.question;
		head.appendChild(text);
		wrap.appendChild(head);
		const opts = document.createElement("div");
		opts.className = "ask-options";
		q.options.forEach((o, oi) => {
			const label = document.createElement("label");
			label.className = "ask-option";
			const input = document.createElement("input");
			input.type = q.multiSelect ? "checkbox" : "radio";
			input.name = `ask-opt-${qi}`;
			input.value = o.label;
			input.dataset.qi = String(qi);
			label.appendChild(input);
			const span = document.createElement("span");
			span.className = "ask-olabel";
			span.textContent = o.label;
			label.appendChild(span);
			if (o.description) {
				const desc = document.createElement("span");
				desc.className = "ask-odesc";
				desc.textContent = o.description;
				label.appendChild(desc);
			}
			opts.appendChild(label);
		});
		wrap.appendChild(opts);
		body.appendChild(wrap);
	});
}

function closeAskDialog(silent) {
	askData = null;
	$("ask-dialog").classList.add("hidden");
	if (!silent) {
		// User closed the dialog without answering → report cancelled.
		sendAskAnswer("", [], true);
	}
}

function submitAskDialog() {
	const d = I18N[lang()] || I18N.en;
	if (!askData) return;
	const answers = [];
	let allAnswered = true;
	askData.questions.forEach((q, qi) => {
		const sel = Array.from(document.querySelectorAll(`input[name="ask-opt-${qi}"]:checked`)).map((i) => i.value);
		if (q.multiSelect) {
			answers.push(sel.join(", "));
		} else {
			if (sel.length) answers.push(sel[0]);
			else { answers.push(""); allAnswered = false; }
		}
	});
	if (!allAnswered) {
		$("ask-error").textContent = d["ask.required"] ?? "Please answer every question.";
		$("ask-error").classList.remove("hidden");
		return;
	}
	sendAskAnswer(askData.toolCallId, answers, false);
}

function sendAskAnswer(toolCallId, answers, cancelled) {
	request("ask_user_question_answer", { toolCallId, answers, cancelled });
	closeAskDialog(true);
}

function setContextTab(tab) {
	contextTab = tab;
	const d = I18N[lang()] || I18N.en;
	$("context-tab-usage").classList.toggle("active", tab === "usage");
	$("context-tab-injections").classList.toggle("active", tab === "injections");
	if (tab === "usage") {
		$("context-usage-body").classList.remove("hidden");
		$("context-injections-body").classList.add("hidden");
	} else {
		$("context-injections-body").classList.remove("hidden");
		$("context-usage-body").classList.add("hidden");
	}
}

async function refreshContextView() {
	const d = I18N[lang()] || I18N.en;
	const errEl = $("context-error");
	errEl.classList.add("hidden");
	try {
		const res = await request("context_view");
		contextData = res;
		renderContextSummary(contextData);
		renderContextUsage(contextData);
		renderContextInjections(contextData);
	} catch (e) {
		errEl.textContent = e.message || String(e);
		errEl.classList.remove("hidden");
	}
}

function esc(s) {
	return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtTokens(n) {
	if (!Number.isFinite(n)) return "–";
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
	return String(n);
}

function renderContextSummary(data) {
	const d = I18N[lang()] || I18N.en;
	const parts = [];
	if (data.modelLabel) parts.push(`<span class="ctx-chip">${esc(data.modelLabel)}</span>`);
	if (data.usage?.estimatedTokens != null) parts.push(`<span class="ctx-chip ctx-chip-tokens">${fmtTokens(data.usage.estimatedTokens)} tokens</span>`);
	const rep = data.usage?.reported;
	if (rep && (rep.tokens != null || rep.percent != null)) {
		const pct = rep.percent != null ? rep.percent : (rep.tokens != null && rep.contextWindow ? Math.round((rep.tokens / rep.contextWindow) * 100) : null);
		const win = rep.contextWindow ? `<span class="ctx-dim">/ ${fmtTokens(rep.contextWindow)}</span>` : "";
		const tok = rep.tokens != null ? fmtTokens(rep.tokens) : "–";
		parts.push(`<span class="ctx-chip">reported ${tok}${win}${pct != null ? ` · ${pct}%` : ""}</span>`);
	}
	$("context-summary").innerHTML = parts.length ? parts.join("") : "";
}

function renderContextUsage(data) {
	const body = $("context-usage-body");
	const categories = data.usage?.categories ?? [];
	const total = categories.reduce((s, c) => s + (c.tokens || 0), 0) || 1;
	if (!categories.length) {
		body.innerHTML = `<div class="ctx-empty">${esc(d["context.empty"] ?? "No data")}</div>`;
		return;
	}
	// Flat table: parent rows + indented child rows; click parent to expand entries
	const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
	const catRows = categories.map((cat) => {
		const pct = Math.round(((cat.tokens || 0) / total) * 100);
		const kids = (cat.children ?? []).map((child) => {
			const childPct = Math.round(((child.tokens || 0) / total) * 100);
			return `
		<tr class="ctx-row ctx-row-child" data-exp=\"${escAttr(child.label)}\">
			<td class="ctx-td-label"><span class="ctx-indent">↳</span> ${esc(child.label)}</td>
			<td class="ctx-td-tok">${fmtTokens(child.tokens)}</td>
			<td class="ctx-td-pct">${childPct}%</td>
		</tr>`;
		}).join("");
		const parentEntries = (cat.entries ?? []).map((entry) => `
			<div class="ctx-entry-line">
				<span class="ctx-entry-tokens">${fmtTokens(entry.tokens)}</span>
				<span class="ctx-entry-label">${esc(entry.label)}</span>
				${entry.truncatedText ? `<pre class="ctx-entry-text">${esc(entry.truncatedText)}</pre>` : ""}
			</div>`).join("");
		const entries = (cat.children ?? []).map((child) => {
			const kids2 = (child.entries ?? []).map((entry) => `
				<div class="ctx-entry-line">
					<span class="ctx-entry-tokens">${fmtTokens(entry.tokens)}</span>
					<span class="ctx-entry-label">${esc(entry.label)}</span>
					${entry.truncatedText ? `<pre class="ctx-entry-text">${esc(entry.truncatedText)}</pre>` : ""}
				</div>`).join("");
			return kids2 ? `<div class="ctx-expand" data-exp=\"${escAttr(child.label)}\">${kids2}</div>` : "";
		}).join("");
		const parentExpand = parentEntries ? `<div class="ctx-expand" data-exp=\"${escAttr(cat.label)}\">${parentEntries}</div>` : "";
		const entriesAll = parentExpand + entries;
		return `
		<tr class="ctx-row ctx-row-parent" data-role=\"parent\" data-exp=\"${escAttr(cat.label)}\" tabindex="0">
			<td class="ctx-td-label"><span class="ctx-twisty">▸</span> ${esc(cat.label)}</td>
			<td class="ctx-td-tok">${fmtTokens(cat.tokens)}</td>
			<td class="ctx-td-pct">${pct}%</td>
		</tr>
		${entriesAll}`;
	}).join("");
	body.innerHTML = `<table class="ctx-table">
		<thead><tr><th class="ctx-th-label">${esc(d["context.col-category"] ?? "category")}</th><th class="ctx-th-tok">${esc(d["context.col-tokens"] ?? "tokens")}</th><th class="ctx-th-pct">%</th></tr></thead>
		<tbody>${catRows}</tbody>
	</table>`;
	body.querySelectorAll(".ctx-row-parent").forEach((tr) => {
		tr.addEventListener("click", () => {
			const key = tr.dataset.exp;
			tr.classList.toggle("open");
			tr.querySelector(".ctx-twisty").textContent = tr.classList.contains("open") ? "▾" : "▸";
			body.querySelectorAll(`.ctx-expand[data-exp=\"${key}\"]`).forEach((el) => el.classList.toggle("open"));
		});
	});
}

function renderContextInjections(data) {
	const body = $("context-injections-body");
	const items = data.snapshot?.items ?? [];
	const total = items.reduce((s, it) => s + (it.tokens || 0), 0) || 1;
	if (!items.length) { body.innerHTML = ""; return; }
	const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
	const groupRows = items.map((group) => {
		const pct = Math.round(((group.tokens || 0) / total) * 100);
		const nat = group.source?.native ? "pi" : "ext";
		const itemRows = (group.children ?? []).map((item) => {
			const itemPct = Math.round(((item.tokens || 0) / total) * 100);
			const grand = (item.children ?? []).map((g) => `
				<div class="ctx-entry-line">
					<span class="ctx-entry-tokens">${fmtTokens(g.tokens)}</span>
					<span class="ctx-entry-label">${esc(g.label)}</span>
					${g.text ? `<pre class="ctx-entry-text">${esc(g.text)}</pre>` : ""}
				</div>`).join("");
			return `
		<tr class="ctx-row ctx-row-child" data-exp=\"${escAttr(nat + ":" + item.label)}\">
			<td class="ctx-td-label"><span class="ctx-indent">↳</span> <span class="ctx-native ctx-native-${nat}">${nat}</span> ${esc(item.label)}</td>
			<td class="ctx-td-tok">${fmtTokens(item.tokens)}</td>
			<td class="ctx-td-pct">${itemPct}%</td>
		</tr>
		${grand ? `<div class="ctx-expand" data-exp=\"${escAttr(nat + ":" + item.label)}\">${grand}</div>` : ""}`;
		}).join("");
		return `
	<tr class="ctx-row ctx-row-parent" data-exp=\"${escAttr(nat + ":" + group.label)}\" tabindex="0">
		<td class="ctx-td-label"><span class="ctx-twisty">▸</span> <span class="ctx-native ctx-native-${nat}">${nat}</span> ${esc(group.label)}</td>
		<td class="ctx-td-tok">${fmtTokens(group.tokens)}</td>
		<td class="ctx-td-pct">${pct}%</td>
	</tr>
	${itemRows}`;
	}).join("");
	body.innerHTML = `<table class="ctx-table">
		<thead><tr><th class="ctx-th-label">${esc(d["context.col-category"] ?? "category")}</th><th class="ctx-th-tok">${esc(d["context.col-tokens"] ?? "tokens")}</th><th class="ctx-th-pct">%</th></tr></thead>
		<tbody>${groupRows}</tbody>
	</table>`;
	body.querySelectorAll(".ctx-row-parent").forEach((tr) => {
		tr.addEventListener("click", () => {
			const key = tr.dataset.exp;
			tr.classList.toggle("open");
			tr.querySelector(".ctx-twisty").textContent = tr.classList.contains("open") ? "▾" : "▸";
			body.querySelectorAll(`.ctx-expand[data-exp=\"${key}\"]`).forEach((el) => el.classList.toggle("open"));
		});
	});
}

/* ─────────────────────────────────────────────────────────────────────────────
 * settings dialog
 * ────────────────────────────────────────────────────────────────────────────*/
function openSettings() {
	const d = I18N[lang()] || I18N.en;
	$("cfg-host").value = state.settings.host;
	$("cfg-port").value = state.settings.port;
	$("cfg-auto-reconnect").checked = !!state.settings.autoReconnect;
	$("cfg-show-tool-calls").checked = !!state.settings.showToolCalls;
	$("cfg-show-thinking").checked = !!state.settings.showThinking;
	$("cfg-autoscroll").checked = !!state.settings.autoscroll;
	$("cfg-markdown").checked = !!state.settings.markdown;
	$("cfg-collapse-tools").checked = !!state.settings.collapseTools;
	$("settings-dialog").classList.remove("hidden");
}
function closeSettings() { $("settings-dialog").classList.add("hidden"); }

/* ─────────────────────────────────────────────────────────────────────────────
 * session ops
 * ────────────────────────────────────────────────────────────────────────────*/
async function newSession() {
	const d = I18N[lang()] || I18N.en;
	try { await request("new_session"); notify(d["msg.new-session"], "success"); }
	catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function forkLast() {
	const d = I18N[lang()] || I18N.en;
	try { await request("fork"); notify(d["msg.forked"], "success"); }
	catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function compact() {
	const d = I18N[lang()] || I18N.en;
	try { await request("compact"); notify(d["msg.compacted"], "success"); }
	catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function reload() {
	const d = I18N[lang()] || I18N.en;
	try { await request("reload"); notify(d["msg.reloaded"], "success"); }
	catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function exportSession() {
	const d = I18N[lang()] || I18N.en;
	try {
		const result = await request("export", {});
		if (result?.url) notify(tpl(d["msg.exported"], { url: result.url }), "success", 5000);
		else notify("export done", "success");
	} catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function setSessionName(name) {
	const d = I18N[lang()] || I18N.en;
	try {
		await request("set_session_name", { name });
		if (state.snapshot) state.snapshot.sessionName = name;
		renderSessionName();
		notify(tpl(d["msg.session-renamed"], { name }), "success", 1800);
	} catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function setModel(value) {
	const d = I18N[lang()] || I18N.en;
	// value can be:
	//   - "provider::modelId" (from <select> option.value)
	//   - just "modelId" (from promptText / palette legacy) — look up provider in snapshot
	//   - an object { provider, id } (from palette model-select payload after refactor)
	let provider, modelId;
	if (value && typeof value === "object") {
		provider = value.provider; modelId = value.id ?? value.modelId;
	} else if (typeof value === "string") {
		const idx = value.indexOf("::");
		if (idx >= 0) {
			provider = value.slice(0, idx); modelId = value.slice(idx + 2);
		} else {
			modelId = value;
			const sm = state.snapshot?.scopedModels ?? state.snapshot?.availableModels ?? state.snapshot?.models ?? [];
			const hit = sm.find((m) => (m.id ?? m.modelId) === value);
			if (hit) provider = hit.provider;
		}
	}
	try {
		await request("set_model", { provider, modelId });
		notify(tpl(d["msg.model-changed"], { model: modelId }), "info", 1500);
	} catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function setThinking(level) {
	const d = I18N[lang()] || I18N.en;
	try {
		await request("set_thinking_level", { level });
		notify(tpl(d["msg.thinking-changed"], { level }), "info", 1500);
	} catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function cycleThinking() {
	const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
	const cur = state.snapshot?.thinkingLevel ?? "medium";
	const idx = levels.indexOf(cur);
	const next = levels[(idx + 1) % levels.length];
	await setThinking(next);
}
async function abort() {
	const d = I18N[lang()] || I18N.en;
	try { await request("abort"); notify(d["msg.aborted"], "info"); }
	catch (e) { notify(tpl(d["msg.error"], { error: e.message }), "error"); }
}
async function refreshState() {
	try {
		const snap = await request("get_state");
		state.snapshot = { ...(state.snapshot ?? {}), ...snap };
		renderSnapshot();
	} catch (e) { /* ignore */ }
}

// PowerBar parity: lightweight powerbar refresh (git/context/tokens/sub only).
// Avoids re-rendering the whole UI; throttled so rapid tool results don't spam get_state.
let _pbTimer = null;
async function refreshPowerbar() {
	if (_pbTimer) return; // already queued
	_pbTimer = setTimeout(async () => {
		_pbTimer = null;
		try {
			const res = await request("get_state");
			if (!res || !res.success || !res.data) return;
			const data = res.data;
			if (state.snapshot) {
				// Merge only the powerbar stats to avoid clobbering rapid message events.
				state.snapshot.powerbar = data.powerbar ?? state.snapshot.powerbar;
				renderPowerbar();
			}
		} catch (e) { /* ignore */ }
	}, 150);
}


/* ─────────────────────────────────────────────────────────────────────────────
 * theme / lang toggles
 * ────────────────────────────────────────────────────────────────────────────*/
function applyTheme(t) {
	const eff = t === "auto" ? detectTheme() : t;
	document.documentElement.setAttribute("data-theme", t);
	document.documentElement.setAttribute("data-effective-theme", eff);
}
function toggleTheme() {
	const cur = state.settings.theme;
	state.settings.theme = cur === "auto" ? "dark" : cur === "dark" ? "light" : "auto";
	applyTheme(state.settings.theme);
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch {}
}
function toggleLang() {
	const cur = state.settings.lang;
	state.settings.lang = cur === "auto" ? "en" : cur === "en" ? "zh" : "auto";
	const l = state.settings.lang === "auto" ? detectLang() : state.settings.lang;
	applyLang(l);
	updateComposerHint();
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch {}
}

/* ─────────────────────────────────────────────────────────────────────────────
 * context menu (right-click on bubble)
 * ────────────────────────────────────────────────────────────────────────────*/
function openContextMenu(e, wrap) {
	e.preventDefault();
	const d = I18N[lang()] || I18N.en;
	const items = [
		{ label: d["action.copy"], action: () => copyBubble(wrap) },
		{ label: d["action.fork-here"], action: () => forkFromBubble(wrap) },
	];
	const menu = $("context-menu");
	menu.innerHTML = "";
	for (const it of items) {
		const row = document.createElement("button");
		row.className = "context-menu-item";
		row.textContent = it.label;
		row.addEventListener("click", () => { it.action(); closeContextMenu(); });
		menu.appendChild(row);
	}
	menu.style.left = `${e.clientX}px`;
	menu.style.top = `${e.clientY}px`;
	menu.classList.remove("hidden");
	setTimeout(() => {
		document.addEventListener("click", closeContextMenu, { once: true });
	}, 0);
}
function closeContextMenu() {
	$("context-menu").classList.add("hidden");
}

/* ─────────────────────────────────────────────────────────────────────────────
 * keyboard shortcuts (global)
 * ────────────────────────────────────────────────────────────────────────────*/
function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform); }
function modKey(e) { return isMac() ? e.metaKey : e.ctrlKey; }
function bindKeyboard() {
	document.addEventListener("keydown", (e) => {
		const mod = modKey(e);
		// Close any open dialog on Esc
		if (e.key === "Escape") {
			if (state.paletteOpen) { closePalette(); e.preventDefault(); return; }
			if (!$("help-dialog").classList.contains("hidden")) { closeHelp(); e.preventDefault(); return; }
			if (!$("settings-dialog").classList.contains("hidden")) { closeSettings(); e.preventDefault(); return; }
			if (!$("context-dialog").classList.contains("hidden")) { closeContextDialog(); e.preventDefault(); return; }
			if (!$("ask-dialog").classList.contains("hidden")) { closeAskDialog(false); e.preventDefault(); return; }
			if (state.slashMenuOpen) { closeSlashMenu(); return; }
			if (state.mode === "busy") { abort(); e.preventDefault(); return; }
		}
		// F1 help
		if (e.key === "F1") { e.preventDefault(); openHelp(); return; }
		// Ctrl+K palette
		if (mod && (e.key === "k" || e.key === "K")) { e.preventDefault(); openPalette(); return; }
		// Ctrl+T cycle thinking
		if (mod && (e.key === "t" || e.key === "T") && !state.paletteOpen) {
			const tag = (document.activeElement?.tagName ?? "").toLowerCase();
			if (tag === "input" || tag === "textarea" || tag === "select") return;
			e.preventDefault(); cycleThinking(); return;
		}
		// Ctrl+U attach image
		if (mod && (e.key === "u" || e.key === "U")) {
			const tag = (document.activeElement?.tagName ?? "").toLowerCase();
			if (tag === "input" || tag === "textarea") return;
			e.preventDefault(); $("file-input").click(); return;
		}
	});
}

/* ─────────────────────────────────────────────────────────────────────────────
 * composer slash-menu interception
 * ────────────────────────────────────────────────────────────────────────────*/
function bindComposer() {
	const composer = $("composer");
	composer.addEventListener("input", () => {
		autoSizeComposer();
		// Slash menu when text starts with "/"
		const text = composer.value;
		if (text.startsWith("/") && !text.includes("\n") && !text.includes(" ")) {
			openSlashMenu(text);
		} else if (state.slashMenuOpen) {
			closeSlashMenu();
		}
	});
composer.addEventListener("paste", (e) => {
		// ctrl+v with a file on the clipboard: clipboardData.items contains File entries.
		const items = e.clipboardData?.items;
		if (!items || items.length === 0) return;
		const files = [];
		for (const it of items) {
			if (it.kind === "file") {
				const f = it.getAsFile();
				if (f) files.push(f);
			}
		}
		if (files.length === 0) return; // plain text — let browser handle
		e.preventDefault();
		(async () => { for (const f of files) await attachImage(f); })();
	});
composer.addEventListener("keydown", (e) => {
		if (state.slashMenuOpen) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				state.slashMenuIndex = Math.min(state.slashMenuMatches.length - 1, state.slashMenuIndex + 1);
				renderSlashMenu();
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				state.slashMenuIndex = Math.max(0, state.slashMenuIndex - 1);
				renderSlashMenu();
				return;
			}
			if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
				e.preventDefault();
				selectSlashItem(state.slashMenuIndex);
				return;
			}
			if (e.key === "Escape") { e.preventDefault(); closeSlashMenu(); return; }
		}
		if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			// If text starts with /, try to dispatch as slash command
			if (composer.value.startsWith("/")) {
				const ok = runSlashCommand(composer.value);
				if (ok) { clearComposer(); return; }
			}
			send("send");
			return;
		}
		if (modKey(e) && e.key === ".") { e.preventDefault(); send("steer"); return; }
		if (modKey(e) && e.shiftKey && e.key === "Enter") { e.preventDefault(); send("follow_up"); return; }
	});
}

/* ─────────────────────────────────────────────────────────────────────────────
 * boot
 * ────────────────────────────────────────────────────────────────────────────*/
function boot() {
	loadSettings();
	state.autoscroll = !!state.settings.autoscroll;
	applyTheme(state.settings.theme);
	applyLang(state.settings.lang === "auto" ? detectLang() : state.settings.lang);
	updateComposerHint();
	updateEmptyState();
	updateAutoscrollIndicator();

	// Click-to-load earlier messages (lazy pagination).
	$("messages").addEventListener("click", (e) => {
		const t = e.target;
		if (t instanceof HTMLElement && t.dataset?.action === "load-earlier") {
			loadEarlierMessages();
		}
	});

	// Top-bar bindings
	$("theme-toggle").addEventListener("click", toggleTheme);
	$("lang-toggle").addEventListener("click", toggleLang);
	$("palette").addEventListener("click", openPalette);
	$("help-btn").addEventListener("click", openHelp);
	$("help-close").addEventListener("click", closeHelp);
	$("settings-btn").addEventListener("click", openSettings);
	$("settings-cancel").addEventListener("click", closeSettings);
	$("context-close").addEventListener("click", closeContextDialog);
	$("context-refresh").addEventListener("click", refreshContextView);
	$("context-tab-usage").addEventListener("click", () => setContextTab("usage"));
	$("context-tab-injections").addEventListener("click", () => setContextTab("injections"));
	$("settings-save").addEventListener("click", async () => {
		await saveSettings();
		closeSettings();
		notify(I18N[lang()]?.["msg.settings-saved"] ?? "saved", "success", 1500);
		if (state.ws) { state.ws.close(); state.ws = null; }
		connect();
	});

	// Sidebar bindings
	$("abort").addEventListener("click", abort);
	$("send").addEventListener("click", () => send("send"));
	$("steer").addEventListener("click", () => send("steer"));
	$("follow-up").addEventListener("click", () => send("follow_up"));
	$("model").addEventListener("change", (e) => setModel(e.target.value));
	$("thinking").addEventListener("change", (e) => setThinking(e.target.value));
	$("cycle-thinking").addEventListener("click", cycleThinking);
	$("session-name").addEventListener("change", (e) => setSessionName(e.target.value.trim()));
	$("new-session").addEventListener("click", newSession);
	$("fork-current").addEventListener("click", forkLast);
	$("compact").addEventListener("click", compact);
	$("reload").addEventListener("click", reload);
	$("rename-session").addEventListener("click", async () => {
		const name = await promptText("session name", "");
		if (name != null) setSessionName(name);
	});
	$("export-session").addEventListener("click", exportSession);
	$("refresh-tree").addEventListener("click", refreshState);

	// Attach image
	$("attach").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", async (e) => {
		const files = Array.from(e.target.files || []);
		for (const f of files) await attachImage(f);
		e.target.value = "";
	});

	// Composer
	$("composer").addEventListener("input", autoSizeComposer);
	bindComposer();

	// Scroll affordance
	$("scroll-down").addEventListener("click", () => { state.autoscroll = true; scrollMessagesDown(true); });
	$("messages").addEventListener("scroll", () => {
		const el = $("messages");
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		if (!atBottom) state.autoscroll = false;
		else state.autoscroll = true;
		updateAutoscrollIndicator();
		$("scroll-down").classList.toggle("hidden", state.autoscroll);
	});

	// Dialog click-outside
	$("settings-dialog").addEventListener("click", (e) => { if (e.target.id === "settings-dialog") closeSettings(); });
	$("help-dialog").addEventListener("click", (e) => { if (e.target.id === "help-dialog") closeHelp(); });
	$("context-dialog").addEventListener("click", (e) => { if (e.target.id === "context-dialog") closeContextDialog(); });
	$("prompt-dialog").addEventListener("click", (e) => { if (e.target.id === "prompt-dialog") $("prompt-cancel").click(); });
	$("ask-dialog").addEventListener("click", (e) => { if (e.target.id === "ask-dialog") closeAskDialog(false); });
	$("ask-close").addEventListener("click", () => closeAskDialog(false));
	$("ask-cancel").addEventListener("click", () => closeAskDialog(false));
	$("ask-submit").addEventListener("click", submitAskDialog);


	// Keyboard
	bindKeyboard();

	// System theme auto-switch
	window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
		if (state.settings.theme === "auto") applyTheme("auto");
	});

	// If the server didn't inject __PI_WEBUI__ (e.g. opened via direct URL),
	// scan nearby ports for a running instance.
	if (!SERVER_INJECTED) {
		discoverBridge().finally(() => connect());
	} else {
		connect();
	}

	// Expose abort for chrome extension
	window.__piWebUiAbort = () => abort();
}
boot();
