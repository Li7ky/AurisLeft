# 贡献指南

感谢你对 AurisLeft 项目的关注。欢迎任何形式的贡献，包括代码提交、文档改进、Bug 报告或功能建议。

## 目录

- [开发环境要求](#开发环境要求)
- [如何贡献代码](#如何贡献代码)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [如何报告 Bug](#如何报告-bug)
- [如何提交功能建议](#如何提交功能建议)

## 开发环境要求

在开始开发之前，请确保你的环境满足以下要求。

### 系统要求

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0

当前主路径为 **Electron + React**，无需安装 Rust / Tauri。

### 推荐的 IDE 配置

- [VS Code](https://code.visualstudio.com/)
- 扩展推荐:
  - [ES7+ React/Redux/React-Native snippets](https://marketplace.visualstudio.com/items?itemName=dsznajder.es7-react-js-snippets)
  - [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 如何贡献代码

### 1. Fork 仓库

在 GitHub 上点击 Fork 按钮，将仓库复制到你的个人账号。

### 2. 克隆仓库

```bash
git clone https://github.com/<你的用户名>/AurisLeft.git
cd AurisLeft
```

### 3. 添加上游远程仓库

```bash
git remote add upstream https://github.com/Li7ky/AurisLeft.git
```

### 4. 创建特性分支

```bash
git checkout -b feat/your-feature-name
```

分支命名规范:

| 分支 / 前缀 | 说明 | 示例 |
|------|------|------|
| `测试版` | 当前联调与体验用测试通道（beta） | `测试版` |
| `正式版` / `main` | 稳定后上线用（发布通道） | `main`、`正式版` |
| `feat/` | 新功能（从测试版拉出） | `feat/add-lyric-sync` |
| `fix/` | Bug 修复 | `fix/player-crash-on-playlist` |
| `chore/` | 杂务/构建/文档 | `chore/update-readme` |
| `refactor/` | 代码重构 | `refactor/source-manager` |

### 5. 安装依赖并启动

```bash
npm install
npm run dev
```

国内若 Electron 下载失败，可设置：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

### 6. 完成你的更改

在提交前请确保：

- 运行 `npm run typecheck` 通过
- 相关播放 / 搜索 / 设置路径手动验证通过
- 遵循项目的代码规范

## 代码规范

### 通用规范

- **格式化**: 使用 Prettier 进行格式化，项目已包含 `.prettierrc` 配置
- **命名规范**:
  - 文件/目录: kebab-case 或与现有目录一致（`pages/Home`）
  - 组件: PascalCase (`PlayerBar.tsx`)
  - 函数/变量: camelCase (`getPlaylist()`)
  - 常量: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **注释**: 复杂逻辑需要注释；公共 API 使用 JSDoc 风格文档注释

### 架构提示

- 渲染进程 UI 与状态：`src/`
- 主进程 IPC / 音源 / 存储：`electron/`
- 前端调用桌面能力：`src/utils/tauri.ts`（Electron IPC 封装，历史命名）
- 路由使用 `HashRouter`（兼容 `file://` 打包加载）

## 提交规范

提交信息建议使用简洁的英文或中文说明「改了什么 / 为什么」：

```text
fix(player): respect autoPlayNext and persist volume
feat(local): extract embedded cover art
```

## 如何报告 Bug

请尽量包含：

1. 操作系统与应用版本
2. 复现步骤
3. 期望行为与实际行为
4. 控制台 / 主进程日志（如有）

## 如何提交功能建议

描述使用场景与期望交互即可；若已有类似能力（洛雪音源、歌单、本地库），请说明差异。

再次感谢你的贡献！
