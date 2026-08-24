# dsh-chat-tick-rail

`dsh-chat-tick-rail` 是专为 `deepseek-harness` web 界面设计的会话内快速导航刻度条插件（Codex / ZCode 风格）。

在对话滚动区左缘叠加一列精简刻度线：每条用户/指导轮次对应一个刻度，视口位置滑动指示器（Marker）随阅读位置实时追踪；鼠标悬停或键盘聚焦刻度时显示带轮次编号与模型思考提要的浮层预览，点击即可平滑跳转到对应消息。

---

## ✨ 核心特性

- **轮次状态与错误感知（Error Turn Indication）**：自动检测 `turn-error` 节点并将出错刻度标红，悬停预览即时展示报错原因，长排错任务一目了然。
- **工具调用与思考摘要（Tool Badges & Thoughts）**：浮层展示轮次编号（如 `#3/12`）、用户问题开头、思考提要以及关联的工具执行徽标（如 `[🔧 2 edit,bash]`）。
- **上下文截断/压缩分界（Compaction Separator）**：检测 Harness 的 `compaction` 节点，在截断处绘制极简虚线分界线。
- **拖拽洗牌滚动（Drag-to-Scrub）**：支持按住导轨上下拖拽滑块，视口随指针连续平滑滚动并实时呈现当前悬停轮次的预览浮层。
- **GPU 硬件加速渲染（Hardware Acceleration）**：全面采用 `transform: translate3d` 与 `will-change: transform`，大幅提升 120Hz 高刷下的拖拽与滚动流畅度。
- **Pin 锁定与空白处关闭**：点击刻度平滑滚动跳转并固定（Pin）预览框；点击页面空白区域或按下 `Esc` 键自动取消固定。
- **无感分页与 Key 稳定性**：基于 `data-chat-anchor-key` 进行会话节点定位，向上滚动加载更早历史消息时，Pinned 状态和刻度高亮保持绝对精准。
- **全键盘与无障碍支持（A11y）**：
  - **聚焦刻度**：支持 `ArrowUp` / `ArrowDown`（或 `ArrowLeft` / `ArrowRight`）在刻度间切换，`Home` / `End` 切换至首尾，`Enter` / `Space` 触发跳转。
  - **全局快捷键**：在页面任意位置使用 `Alt + ArrowUp` / `Alt + ArrowDown` 快速在上一个/下一个用户提问间穿梭。
  - **ARIA 规范**：提供 `role="navigation"`、`role="button"` 及视口贴近项的 `aria-current="step"` 状态。
- **思考中呼吸动效（Streaming Pulse）**：在模型思考或流式输出期间，最后一个刻度呈现平滑律动的呼吸灯动效。
- **超长会话自适应密度缩放**：长会话（50+ 轮）自动压缩刻度间距，确保导轨总高度始终保持在可视区域的 70% 以内，不溢出视口。
- **完美融合深色/浅色主题**：严格使用 deepseek-harness 的 `--dsw-alias-*` 设计系统 Token，原生支持 `body[data-ds-dark-theme]`。
- **多模态与窄屏兜底**：包含 `[图片]`、`[代码]`、`[附件]` 多模态占位预览；视口过窄（`< 360px`）或移动端自动折叠。

---

## 快捷键一览

| 快捷键 | 作用范围 | 说明 |
|---|---|---|
| `Alt + ArrowUp` | 全局 | 快速跳转至上一条用户消息 |
| `Alt + ArrowDown` | 全局 | 快速跳转至下一条用户消息 |
| `Escape` | 全局 / 导轨聚焦 | 关闭当前 Pinned 浮层预览 |
| `ArrowUp` / `ArrowDown` | 刻度聚焦 | 在各个刻度之间切换焦点并预览 |
| `Home` / `End` | 刻度聚焦 | 快速移动至会话起点 / 终点 |
| `Enter` / `Space` | 刻度聚焦 | 跳转至当前聚焦的轮次并固定预览 |

---

## 安装与使用

```sh
# 在 deepseek-harness 仓库根目录下执行

# 从 npm 安装
pnpm dsh plugin --profile web add dsh-chat-tick-rail

# 或从本地源码目录安装（开发调试）
pnpm dsh plugin --profile web add ../dsh-plugins/dsh-chat-tick-rail

# 启动或重启 web 服务
pnpm dsh --profile web
```

卸载插件：
```sh
pnpm dsh plugin --profile web remove dsh-chat-tick-rail
```

---

## 插件结构与 DOM 契约

| 文件 | 说明 |
|---|---|
| `cordis.patch.yml` | bundle patch：向组合树注入插件配置 |
| `lib/index.js` | Node 宿主端入口（浏览器插件无需服务端操作） |
| `lib/client.js` | 纯客户端浏览器半边：零依赖的 vanilla DOM 闭包模块 |
| `test/rail-layout.test.cjs` | 覆盖视口计算、键盘交互、动态压缩与流式检测的单元测试 |

**DOM 契约依赖**：
- `[data-conversation-scroll]`：对话滚动容器
- `[data-chat-flow]`：消息列根节点
- `[data-chat-flow-kind="user" | "steering" | "command-input"]`：用户侧消息轮次
- `[data-chat-flow-kind="assistant" | "assistant-step"]`：模型侧思考与回复内容
- `[data-chat-anchor-key]`：各轮次的稳定锚点 Key

---

## License

MIT
