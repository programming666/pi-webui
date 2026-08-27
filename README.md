# pi-webui — the Pi extension


![认可linux.do](https://ld.xh.do/ld-badge.svg)
> 🇨🇳 中文版本：[`README.zh-CN.md`](README.zh-CN.md)

A pi extension that bridges the active pi session to a local HTTP +
WebSocket server. Paired with the [`browser-extension/`](../browser-extension/)
side panel, it lets you drive your pi agent entirely from Chrome.

## What it does

- Listens on `http://127.0.0.1:9777` by default.
- Speaks a small JSON protocol (see [`src/types.ts`](src/types.ts)).
- Forwards every pi session event (message updates, tool calls, model
  switches, compaction, session transitions, …) over a WebSocket.
- Accepts requests for prompt / steer / follow-up / abort / model /
  thinking / tools / session ops.
- Falls back to a tiny REST surface for simple one-shot clients.

## Install

```sh
npm install
```

That is the entire install. pi discovers the extension via the
`pi.extensions` field in `package.json`.

## Run

```sh
npx pi
```

The bridge prints a banner the first time it's ready. If you'd rather
not start the bridge, set `PI_WEBUI_DISABLE=1`.

## Environment variables

| var | default | meaning |
| --- | --- | --- |
| `PI_WEBUI_PORT` | `9777` | TCP port |
| `PI_WEBUI_HOST` | `127.0.0.1` | bind address. Use `0.0.0.0` to expose. |
| `PI_WEBUI_DISABLE` | unset | Set to `1` to skip starting the bridge. |

## Layout

```
src/
├── types.ts     ← protocol message shapes
├── server.ts    ← HTTP + WebSocket transport (no pi knowledge)
├── bridge.ts    ← extension API adapter (pi knowledge, no transport)
└── index.ts     ← wires them together; registers the extension
```

The split is deliberate: `server.ts` never imports pi, and `bridge.ts`
never opens a socket. `index.ts` is the only place that knows both
universes exist. This makes it easy to swap one without touching the
other.

## How session-shaping works

Operations like `new_session`, `fork`, `compact`, and `switch_session`
live on `ExtensionCommandContext` rather than the plain
`ExtensionContext`, which means they can only be called from inside a
slash command handler. The bridge works around this by:

1. Registering a hidden `/webui-do` slash command.
2. Emitting a `webui:do` event with a `requestId` and operation payload.
3. Waiting for the matching `webui:response` event back from the command
   handler (matched by `requestId`).

The command handler parses the payload, invokes the right
`ctx.newSession()` / `ctx.fork()` / `ctx.switchSession()` call, and
emits the response. A 10-second timeout protects against lost replies.

## License

MIT. See [`package.json`](package.json).