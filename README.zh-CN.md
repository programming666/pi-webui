# pi-webui — Pi 扩展（中文）


![认可linux.do](https://ld.xh.do/ld-badge.svg)
> 🇬🇧 English version: [`README.md`](README.md)

一个 Pi 扩展，把活跃的 pi 会话桥接到本地 HTTP + WebSocket 服务器。配合 [`browser-extension/`](../browser-extension/) 侧边栏使用，可以在 Chrome 中完全驱动 pi agent。

## 它做什么

- 默认监听 `http://127.0.0.1:9777`。
- 使用一套简洁的 JSON 协议（见 [`src/types.ts`](src/types.ts)）。
- 通过 WebSocket 转发每一个 pi 会话事件（消息更新、工具调用、模型切换、压缩、会话切换……）。
- 接收 prompt / steer / follow-up / abort / 模型 / 思考 / 工具 / 会话操作 等请求。
- 提供一组 REST 端点作为一次性客户端的备用入口。

## 安装

```sh
npm install
```

到此为止。Pi 通过 `package.json` 的 `pi.extensions` 字段自动发现扩展。

## 启动

```sh
npx pi
```

网桥就绪后会打印横幅。如果不想启动网桥，设置 `PI_WEBUI_DISABLE=1`。

## 环境变量

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `PI_WEBUI_PORT` | `9777` | TCP 端口 |
| `PI_WEBUI_HOST` | `127.0.0.1` | 绑定地址。设为 `0.0.0.0` 会暴露到所有网卡 |
| `PI_WEBUI_DISABLE` | 未设置 | 设为 `1` 完全跳过网桥启动 |

## 模块结构

```
src/
├── types.ts     ← 协议消息类型
├── server.ts    ← HTTP + WebSocket 传输层（不知道 pi 的存在）
├── bridge.ts    ← 扩展 API 适配层（懂 pi，但不开 socket）
└── index.ts     ← 把两边接起来，并注册扩展
```

这种拆分是刻意的：`server.ts` 从不 import pi，`bridge.ts` 从不创建 socket，`index.ts` 是唯一同时认识两者的入口。替换其中一侧时另一侧无需改动。

## 会话塑形操作的处理方式

`new_session`、`fork`、`compact`、`switch_session` 这些操作只存在于 `ExtensionCommandContext`，普通的 `ExtensionContext` 没有——也就是说只能在斜杠命令处理器内部调用。网桥通过以下方式绕过这个限制：

1. 注册一个隐藏的 `/webui-do` 斜杠命令。
2. 网桥通过 `webui:do` 事件发送带 `requestId` 的操作负载。
3. 命令处理器解析负载、调用对应的 `ctx.newSession()` / `ctx.fork()` / `ctx.switchSession()`，并通过 `webui:response` 事件回传结果（按 `requestId` 匹配）。
4. 10 秒超时保护，防止回执丢失时无限等待。

## 许可证

MIT。详见 [`package.json`](package.json)。