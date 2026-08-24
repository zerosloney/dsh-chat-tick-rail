# dsh-chat-tick-rail

dsh web UI 插件：会话内消息导航刻度条（ZCode/Codex 风格）。在对话滚动区左缘
（正文列左侧的空白槽）叠加一列等间距的中性灰小圆点：每条用户消息一个，视口位置
指示器随阅读位置移动，悬停刻度显示消息预览，点击（或键盘聚焦 + Enter）平滑滚动
到对应消息。

纯客户端插件，不改 agent-loop、不改会话日志。浏览器半边只依赖 `ui-conversation` 的
稳定 DOM 契约：`[data-conversation-scroll]`（滚动容器）、`[data-chat-flow]`（消息列）、
`[data-chat-flow-kind="user"]` 行携带的 `[data-chat-anchor-key]`。

## 安装

```sh
# 在 deepseek-harness 仓库内执行（dsh CLI 从源码运行）
pnpm dsh plugin --profile web add E:/Demo/cli-tools/dsh-chat-tick-rail

# 插件集在启动时扫描，需重启 web 服务生效
pnpm dsh --profile web
```

`dsh plugin` 通过 pnpm 把本目录安装进 web profile，并因 `dsh.bundle.patch` 声明自动把
该包加入 profile 的 patch 层栈。卸载：`pnpm dsh plugin --profile web remove dsh-chat-tick-rail`。

## 结构

| 文件 | 作用 |
|------|------|
| `cordis.patch.yml` | bundle patch：向组合树插入插件行 |
| `lib/index.js` | node 半边（host 加载入口，无操作） |
| `lib/client.js` | 浏览器半边：`__ModuleLoader__.load` 闭包工厂 bundle，vanilla DOM 实现刻度条 |

`package.json` 的 `dsh.client.platform: "web"` 让 client-modules 注册表把它扫进
`window.__DSH_BOOT__`，经 `/plugins/dsh-chat-tick-rail/client.js` 提供给浏览器。
