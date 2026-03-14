# Cherry Law AI 助手指南

本文档为在此仓库中工作的 AI 编程助手提供指导。Cherry Law 是基于 Cherry Studio 二次开发的专业法律业务场景 AI 助手。遵守这些准则对于保持代码质量和一致性至关重要。

## 指导原则 (必须遵守)

- **保持清晰**：编写易于阅读、维护和解释的代码。
- **匹配项目风格**：重用现有的模式、命名和约定。
- **智能搜索**：优先使用 `ast-grep` 进行语义查询；必要时回退到 `rg`/`grep`。
- **集中日志**：通过 `loggerService` 路由所有日志，并带上正确的上下文——不要使用 `console.log`。
- **通过子代理进行研究**：依靠 `subagent` 获取外部文档、API、新闻和参考。
- **执行前务必提议**：在做出任何更改之前，清楚地解释您的计划方法并等待用户的明确批准，以确保对齐并防止不必要的修改。
- **完成前进行 Lint、测试和格式化**：只有在成功运行 `pnpm lint`、`pnpm test` 和 `pnpm format` 后，编码任务才算完成。
- **编写规范提交**：使用规范提交消息（例如 `feat:`、`fix:`、`refactor:`、`docs:`）提交小的、集中的更改。
- **签署提交**：按照贡献者指南的要求使用 `git commit --signoff`。

## 拉取请求 (PR) 工作流 (至关重要)

创建拉取请求时，您必须使用 `gh-create-pr` 技能。
如果该技能不可用，请直接阅读 `.agents/skills/gh-create-pr/SKILL.md` 并手动遵循。

## 评审工作流

评审拉取请求时，请勿在本地运行 `pnpm lint`、`pnpm test` 或 `pnpm format`。
相反，请直接使用 GitHub CLI 检查 CI 状态：

- **检查 CI 状态**：`gh pr checks <PR_NUMBER>` - 查看 PR 的所有 CI 检查结果
- **检查 PR 详情**：`gh pr view <PR_NUMBER>` - 查看 PR 状态、评审和合并准备情况
- **查看失败日志**：`gh run view <RUN_ID> --log-failed` - 检查失败的 CI 运行日志

仅通过阅读日志调查 CI 失败，而不是在本地重新运行检查。

## Issue 工作流

创建 Issue 时，您必须使用 `gh-create-issue` 技能。
如果该技能不可用，请直接阅读 `.agents/skills/gh-create-issue/SKILL.md` 并手动遵循。

### 当前贡献限制

> **重要**：更改 Redux 数据模型或 IndexedDB 模式的功能 PR 在 v2.0.0 发布之前将**暂时被阻止**。仅接受错误修复、性能改进、文档和非数据模型功能。请在 [#10162](https://github.com/CherryHQ/cherry-studio/pull/10162) 跟踪进度。

## 开发命令

- **安装**：`pnpm install` — 安装所有项目依赖项（需要 Node ≥22, pnpm 10.27.0）
- **开发**：`pnpm dev` — 以开发模式运行 Electron 应用，支持热重载
- **调试**：`pnpm debug` — 启动调试；通过 `chrome://inspect` 在 9222 端口附加
- **构建检查**：`pnpm build:check` — 提交前的**必要步骤**（`pnpm lint && pnpm test`）
  - 如果有 i18n 排序问题，请先运行 `pnpm i18n:sync`
  - 如果有格式化问题，请先运行 `pnpm format`
- **完整构建**：`pnpm build` — TypeScript 类型检查 + electron-vite 构建
- **测试**：`pnpm test` — 运行所有 Vitest 测试（main + renderer + aiCore + shared + scripts）
  - `pnpm test:main` — 仅主进程测试（Node 环境）
  - `pnpm test:renderer` — 仅渲染进程测试（jsdom 环境）
  - `pnpm test:aicore` — 仅 aiCore 包测试
  - `pnpm test:watch` — 监听模式
  - `pnpm test:coverage` — 带有 v8 覆盖率报告
  - `pnpm test:e2e` — Playwright 端到端测试
- **Lint**：`pnpm lint` — oxlint + eslint 修复 + TypeScript 类型检查 + i18n 检查 + 格式检查
- **格式化**：`pnpm format` — Biome 格式化 + lint（写入模式）
- **类型检查**：`pnpm typecheck` — 使用 `tsgo` 同时进行 node + web 的 TypeScript 检查
- **i18n**：
  - `pnpm i18n:sync` — 同步 i18n 模板键
  - `pnpm i18n:translate` — 自动翻译缺失的键
  - `pnpm i18n:check` — 验证 i18n 完整性
- **产物分析**：`pnpm analyze:renderer` / `pnpm analyze:main` — 可视化产物大小
- **Agents 数据库**：
  - `pnpm agents:generate` — 生成 Drizzle 迁移
  - `pnpm agents:push` — 将架构推送到 SQLite 数据库
  - `pnpm agents:studio` — 打开 Drizzle Studio

## 项目架构

### Electron 结构

```
src/
  main/          # Node.js 后端（Electron 主进程）
  renderer/      # React UI（Electron 渲染进程）
  preload/       # 安全的 IPC 桥接（contextBridge）
packages/
  aiCore/        # @cherrystudio/ai-core — AI SDK 中间件和提供者抽象
  shared/        # 跨进程类型、常量、IPC 通道定义
  mcp-trace/     # MCP 操作的 OpenTelemetry 追踪
  ai-sdk-provider/  # 自定义 AI SDK 提供者实现
  extension-table-plus/  # TipTap 表格扩展
```

### 关键路径别名

| 别名                    | 解析为                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `@main`                 | `src/main/`                                                                                       |
| `@renderer`             | `src/renderer/src/`                                                                               |
| `@shared`               | `packages/shared/`                                                                                |
| `@types`                | `src/renderer/src/types/`                                                                         |
| `@logger`               | `src/main/services/LoggerService` (主进程) / `src/renderer/src/services/LoggerService` (渲染进程) |
| `@mcp-trace/trace-core` | `packages/mcp-trace/trace-core/`                                                                  |
| `@cherrystudio/ai-core` | `packages/aiCore/src/`                                                                            |

### 主进程 (`src/main/`)

Node.js 后端服务。关键服务：

| 服务               | 职责                                                  |
| ------------------ | ----------------------------------------------------- |
| `WindowService`    | Electron 窗口生命周期管理                             |
| `MCPService`       | 模型上下文协议 (Model Context Protocol) 服务管理      |
| `KnowledgeService` | RAG / 知识库（通过 `@cherrystudio/embedjs`）          |
| `AnthropicService` | Anthropic API 集成                                    |
| `LoggerService`    | 基于 Winston 的结构化日志记录（每日轮转）             |
| `StoreSyncService` | 在主进程和渲染进程之间同步 Redux 状态                 |
| `BackupManager`    | 数据备份/恢复（WebDAV, S3, Nutstore）                 |
| `ApiServerService` | Express HTTP API 服务（Swagger 文档位于 `/api-docs`） |
| `AppUpdater`       | electron-updater 自动更新                             |
| `ShortcutService`  | 全局键盘快捷键                                        |
| `ThemeService`     | 系统主题检测/应用                                     |
| `SelectionService` | 文本选择工具栏功能                                    |
| `CopilotService`   | GitHub Copilot OAuth 集成                             |
| `PythonService`    | Pyodide WASM Python 运行时                            |
| `OvmsManager`      | OpenVINO 模型服务管理                                 |
| `NodeTraceService` | OpenTelemetry 追踪导出                                |

Agents 子系统 (`src/main/services/agents/`):

- Drizzle ORM + LibSQL (SQLite) 架构位于 `database/schema/index.ts`
- 迁移文件位于 `resources/database/drizzle/`
- **目前正在进行 v2 重构** — 仅接受关键错误修复

### 渲染进程 (`src/renderer/src/`)

React 19 + Redux Toolkit SPA。关键结构：

```
aiCore/          # 旧版中间件流水线（已废弃，正在迁移到 packages/aiCore）
api/             # IPC 调用封装（类型化的 electron API 调用）
components/      # 共享 UI 组件（Ant Design 5 + styled-components + TailwindCSS v4）
databases/       # Dexie (IndexedDB) — 主题、文件、消息块等
hooks/           # React hooks (useAssistant, useChatContext, useModel 等)
pages/           # 路由页面（主页、设置、知识库、绘画、笔记等）
services/        # 前端服务 (ApiService, ModelService, MemoryService 等)
store/           # Redux Toolkit 切片 (slices)
types/           # TypeScript 类型定义
workers/         # Web Workers
windows/         # 多窗口入口点（迷你窗口、选择工具栏、追踪窗口）
```

### Redux Store (`src/renderer/src/store/`)

切片 (支持 redux-persist)：

| 切片           | 状态                |
| -------------- | ------------------- |
| `assistants`   | AI 助手配置         |
| `settings`     | 全局应用设置        |
| `llm`          | LLM 提供者/模型配置 |
| `mcp`          | MCP 服务配置        |
| `messageBlock` | 消息块渲染状态      |
| `knowledge`    | 知识库条目          |
| `paintings`    | 图像生成状态        |
| `memory`       | 记忆系统配置        |
| `websearch`    | 网页搜索设置        |
| `shortcuts`    | 键盘快捷键          |
| `tabs`         | 标签页管理          |

> **阻止**：在 v2.0.0 之前，请勿添加新的 Redux 切片或更改现有状态形状。

### 数据库层

- **IndexedDB** (Dexie): `src/renderer/src/databases/index.ts`
  - 表：`files`, `topics`, `settings`, `knowledge_notes`, `translate_history`, `quick_phrases`, `message_blocks`, `translate_languages`
  - 架构版本化并带有升级函数 (`upgradeToV5`, `upgradeToV7`, `upgradeToV8`)
  - **阻止**：在 v2.0.0 之前请勿修改架构。
- **SQLite** (Drizzle ORM + LibSQL): `src/main/services/agents/`
  - 用于 agents 子系统
  - 数据库路径：`~/.cherrystudio/data/agents.db` (开发) / `userData/agents.db` (生产)

### IPC 通信

- 通道常量定义在 `packages/shared/IpcChannel.ts`
- 渲染进程 → 主进程：通过 `src/preload/index.ts` 中的 `api.*` 封装调用 `ipcRenderer.invoke(IpcChannel.XXX, ...args)`
- 主进程 → 渲染进程：`webContents.send(channel, data)`
- 追踪：preload 中的 `tracedInvoke()` 将 OpenTelemetry span 上下文附加到 IPC 调用
- 类型化的 API 表面通过 `contextBridge` 作为 `window.api` 暴露

### AI Core (`packages/aiCore/`)

`@cherrystudio/ai-core` 包抽象了 AI SDK 提供者：

```
src/core/
  providers/    # 提供者注册表 (HubProvider, 工厂, 注册表)
  middleware/   # LanguageModelV2Middleware 流水线 (管理器, 包装器)
  plugins/      # 内置插件
  runtime/      # 运行时执行
  options/      # 请求选项准备
```

- 基于 Vercel AI SDK v5 (`ai` 包) 和 `LanguageModelV2Middleware` 构建
- `HubProvider` 聚合了多个提供者后端
- 支持：OpenAI, Anthropic, Google, Azure, Mistral, Bedrock, Vertex, Ollama, Perplexity, xAI, HuggingFace, Cerebras, OpenRouter, Copilot 等
- openai 包的自定义分支：`@cherrystudio/openai`

### 多窗口架构

渲染进程构建了多个 HTML 入口点：

- `index.html` — 主应用程序窗口
- `miniWindow.html` — 紧凑型浮动窗口 (`src/renderer/src/windows/mini/`)
- `selectionToolbar.html` — 文本选择操作工具栏
- `selectionAction.html` — 选择操作弹出窗口
- `traceWindow.html` — MCP 追踪查看器

### 日志记录

```typescript
import { loggerService } from "@logger";
const logger = loggerService.withContext("moduleName");
// 仅渲染进程：先调用 loggerService.initWindowSource('windowName')
logger.info("message", CONTEXT);
logger.warn("message");
logger.error("message", error);
```

- 后端：Winston，每日日志轮转
- 日志文件位于 `userData/logs/`
- 永远不要使用 `console.log` — 始终使用 `loggerService`

### 追踪 (OpenTelemetry)

- `packages/mcp-trace/` 提供 trace-core 以及 trace-node/trace-web 适配器
- `NodeTraceService` 通过 OTLP HTTP 导出 span
- `SpanCacheService` 为追踪查看器窗口缓存 span 实体
- IPC 调用可以通过 `tracedInvoke()` 携带 span 上下文

## 技术栈

| 层                | 技术                                                 |
| ----------------- | ---------------------------------------------------- |
| 运行时            | Electron 38, Node ≥22                                |
| 前端              | React 19, TypeScript ~5.8                            |
| UI                | Ant Design 5.27, styled-components 6, TailwindCSS v4 |
| 状态              | Redux Toolkit, redux-persist, Dexie (IndexedDB)      |
| 富文本            | TipTap 3.2 (支持 Yjs 协作)                           |
| AI SDK            | Vercel AI SDK v5 (`ai`), `@cherrystudio/ai-core`     |
| 构建              | electron-vite 5 使用 rolldown-vite 7 (实验性)        |
| 测试              | Vitest 3 (单元测试), Playwright (端到端测试)         |
| Lint/格式化       | ESLint 9, oxlint, Biome 2                            |
| 数据库 (主进程)   | Drizzle ORM + LibSQL (SQLite)                        |
| 数据库 (渲染进程) | Dexie (IndexedDB)                                    |
| 日志记录          | Winston + winston-daily-rotate-file                  |
| 追踪              | OpenTelemetry                                        |
| i18n              | i18next + react-i18next                              |

## 约定

### TypeScript

- 启用严格模式；使用 `tsgo` (原生 TypeScript 编译器预览版) 进行类型检查
- 分离配置：`tsconfig.node.json` (主进程), `tsconfig.web.json` (渲染进程)
- 类型定义集中在 `src/renderer/src/types/` 和 `packages/shared/`

### 代码风格

- Biome 处理格式化（2 空格缩进，单引号，尾随逗号）
- oxlint + ESLint 用于 lint 检查；`simple-import-sort` 强制执行导入排序
- React hooks：强制执行 `eslint-plugin-react-hooks`
- 无未使用导入：强制执行 `eslint-plugin-unused-imports`

### 文件命名

- React 组件：`PascalCase.tsx`
- 服务、hooks、工具类：`camelCase.ts`
- 测试文件：与源文件同目录或在 `__tests__/` 子目录中的 `*.test.ts` 或 `*.spec.ts`

### 样式

- **混合方法**：项目使用 Ant Design 5 作为基础 UI 库，并辅以 `styled-components` 用于复杂的自定义组件，以及 `TailwindCSS v4` 用于布局和工具类样式。
- **TailwindCSS v4 语法**：使用简化的 CSS 变量语法。
  - **正确**：`text-(--color-text)`, `bg-(--color-background)`, `rounded-(--border-radius)`
  - **错误**：`text-[var(--color-text)]`, `bg-[var(--color-background)]`, `rounded-[var(--border-radius)]`
- 对于不应传递给 DOM 的 `styled-components` 属性，请使用瞬时属性 (`$color`, `$hoverColor`)。
- 可用的布局原语：来自 `@renderer/components/Layout` 的 `Box`, `HStack`, `VStack`, `Center`。

### i18n

- 所有用户可见的字符串必须使用 `i18next` —— 严禁硬编码 UI 字符串
- 运行 `pnpm i18n:check` 进行验证；运行 `pnpm i18n:sync` 添加缺失的键
- 本地化文件位于 `src/renderer/src/i18n/`

### 带有自定义补丁的包

几个依赖项在 `patches/` 中有补丁 —— 升级时请务必小心：

- `antd`, `@ai-sdk/google`, `@ai-sdk/openai`, `@anthropic-ai/vertex-sdk`
- `@google/genai`, `@langchain/core`, `@langchain/openai`
- `ollama-ai-provider-v2`, `electron-updater`, `epub`, `tesseract.js`
- `@anthropic-ai/claude-agent-sdk`

## 测试指南

- 测试使用带有基于项目配置的 Vitest 3
- 主进程测试：Node 环境, `tests/main.setup.ts`
- 渲染进程测试：jsdom 环境, `tests/renderer.setup.ts`, `@testing-library/react`
- aiCore 测试：独立的 `packages/aiCore/vitest.config.ts`
- 所有测试均可在无 CI 依赖的情况下运行（完全本地运行）
- 通过 v8 提供者进行覆盖率分析 (`pnpm test:coverage`)
- 测试文件：与源文件同目录的 `__tests__/`，或 `*.test.ts`
- **没有测试的功能不被视为完成**

## 组件约定

- 使用 Ant Design 组件作为基础；通过 styled-components 进行扩展
- 严禁直接使用 `useSelector`/`useDispatch` —— 请使用来自 `@renderer/hooks/` 的自定义 hooks
- 全局通知：`window.toast?.success()` / `window.toast?.error()`
- 复杂逻辑需提供双语 JSDoc (中/英)
- 性能：对于复杂组件使用 `memo()`, `useMemo()`, `useCallback()`

## 重要提示

### V2 重构进行中

标有以下标题的文件**被阻止进行功能更改**：

```typescript
/**
 * @deprecated Scheduled for removal in v2.0.0
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING
 * STOP: Feature PRs affecting this file are currently BLOCKED.
 */
```

**受影响的 46 个文件：**

- Redux store: `src/renderer/src/store/` 中的所有切片
- 主进程服务：`ConfigManager.ts`, `StoreSyncService.ts`, `ShortcutService.ts`, `BackupManager.ts`
- 渲染进程 hooks：`useStore.ts`, `useSettings.ts`, `useShortcuts.ts`
- 数据库：`src/renderer/src/databases/` (Dexie 架构)

请勿在这些文件中引入新功能。仅限错误修复。

### 安全

- 严禁直接向渲染进程暴露 Node.js API；在 preload 中使用 `contextBridge`
- 在主进程处理器中验证所有 IPC 输入
- 通过 `strict-url-sanitise` 进行 URL 清洗
- 通过 `ipaddr.js` 进行 IP 验证（API 服务器）
- 使用 `express-validator` 进行 API 服务器请求验证

## 分层文档

本项目对复杂的子系统使用分层的 AGENTS.md 文件：

| 路径                            | 范围                     |
| ------------------------------- | ------------------------ |
| `./AGENTS.md`                   | 根目录 (本文件)          |
| `./packages/aiCore/AGENTS.md`   | @cherrystudio/ai-core 包 |
| `./src/main/services/AGENTS.md` | 主进程服务               |
