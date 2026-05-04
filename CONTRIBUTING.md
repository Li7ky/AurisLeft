# 贡献指南

感谢你对 Music Player 项目的关注！我们欢迎所有形式的贡献，无论是代码提交、文档改进、Bug 报告还是功能建议。

## 📋 目录

- [开发环境要求](#开发环境要求)
- [如何贡献代码](#如何贡献代码)
- [代码规范](#代码规范)
- [提交流程](#提交流程)
- [如何报告 Bug](#如何报告-bug)
- [如何提出功能建议](#如何提出功能建议)

## 开发环境要求

在开始开发之前，请确保你的开发环境满足以下要求：

### 系统依赖

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0 (或其他兼容的包管理器)
- **Rust** >= 1.70.0
- **系统构建工具链**:
  - **Windows**: Visual Studio 2022 或更高版本，需安装 "使用 C++ 的桌面开发" 工作负载
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

> 完整的系统依赖说明请参考 [Tauri 官方 prerequisites 文档](https://tauri.app/start/prerequisites/)。

### 推荐的 IDE 配置

- [VS Code](https://code.visualstudio.com/)
- 扩展推荐:
  - [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
  - [ES7+ React/Redux/React-Native snippets](https://marketplace.visualstudio.com/items?itemName=dsznajder.es7-react-js-snippets)
  - [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 如何贡献代码

### 1. Fork 仓库

在 GitHub 上点击 Fork 按钮，将仓库复制到你的个人账号。

### 2. 克隆仓库

```bash
git clone https://github.com/<你的用户名>/music-player.git
cd music-player
```

### 3. 添加上游远程仓库

```bash
git remote add upstream https://github.com/your-org/music-player.git
```

### 4. 创建特性分支

```bash
git checkout -b feat/your-feature-name
```

分支命名规范:

| 前缀 | 说明 | 示例 |
|------|------|------|
| `feat/` | 新功能 | `feat/add-lyric-sync` |
| `fix/` | Bug 修复 | `fix/player-crash-on-playlist` |
| `chore/` | 构建/工具/文档 | `chore/update-readme` |
| `refactor/` | 代码重构 | `refactor/source-manager` |

### 5. 启动开发服务器

```bash
npm install
npm run tauri dev
```

### 6. 开发与测试

在开发过程中，确保：

- 新增的功能有对应的测试（如适用）
- 所有现有测试通过
- 代码符合项目的编码规范

## 代码规范

### 通用规范

- **代码风格**: 使用 Prettier 进行格式化，项目已包含 `.prettierrc` 配置
- **命名规范**:
  - 文件/目录: kebab-case (`source-manager.ts`)
  - 组件: PascalCase (`PlayerControl.tsx`)
  - 变量/函数: camelCase (`getPlaylist()`)
  - 常量: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **注释**: 复杂逻辑需添加注释，公共 API 使用 JSDoc 风格的文档注释
- **代码异味**: 避免超长函数（建议 < 50 行），保持单一职责

### TypeScript 规范

- 优先使用接口而非类型别名
- 避免使用 `any`，使用 `unknown` 替代
- 明确的函数返回值类型

### React 规范

- 使用函数式组件 + Hooks
- 自定义 Hook 以 `use` 开头
- 组件文件使用 `.tsx` 扩展名
- Props 使用 interface 定义并导出

### Rust 规范 (Tauri Command)

- 遵循 [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Tauri Command 函数使用 `snake_case` 命名
- 错误处理使用 `Result<T, AppError>` 模式

### 提交信息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Type 可选值: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

示例:

```
feat(player): 添加歌词同步滚动功能

- 实现歌词时间戳解析
- 支持滚动到当前播放行
- 添加歌词样式高亮
```

### 格式化与检查

提交前请运行:

```bash
# 格式化代码
npx prettier --write .

# TypeScript 类型检查
npx tsc --noEmit
```

## 提交流程

### 1. 保持分支同步

```bash
git fetch upstream
git rebase upstream/main
```

### 2. 提交更改

```bash
git add .
git commit -m "feat(scope): your commit message"
```

### 3. 推送分支

```bash
git push origin feat/your-feature-name
```

### 4. 创建 Pull Request

1. 访问你的 Fork 仓库页面
2. 点击 "Compare & pull request"
3. 填写 PR 描述，关联相关 Issue（如适用）
4. 等待代码审查

### PR 审查流程

- 提交 PR 后，维护者会进行代码审查
- 可能需要你根据反馈进行修改
- 审查通过后，PR 会被合并到主分支

## 如何报告 Bug

### 提交前检查

- 搜索 [现有 Issues](https://github.com/your-org/music-player/issues)，确认该 Bug 未被报告
- 尝试使用最新版本复现问题
- 收集尽可能多的复现信息

### 提交 Bug 报告

请通过 [Issue 模板](https://github.com/your-org/music-player/issues/new?template=bug_report.md) 提交，包含以下信息:

- **问题描述**: 简明扼要地描述问题
- **复现步骤**: 详细的操作步骤，帮助开发者复现
- **期望行为**: 你认为应该发生什么
- **实际行为**: 实际发生了什么
- **环境信息**:
  - 操作系统及版本
  - 应用版本
  - Node.js / Rust 版本
- **截图/日志**: 如有错误截图或日志文件，请一并提供

### Bug 报告示例

```markdown
### 问题描述
播放列表中点击已删除的歌曲会导致应用崩溃

### 复现步骤
1. 创建一个播放列表，添加 3 首歌
2. 删除第 2 首歌
3. 点击播放列表中原本第 2 首歌的位置

### 期望行为
忽略点击或提示歌曲已删除

### 实际行为
应用闪退，控制台报错: TypeError: Cannot read properties of undefined

### 环境信息
- OS: Windows 11 23H2
- App: v0.1.0
- Node.js: v20.11.0
```

## 如何提出功能建议

### 提交前检查

- 搜索 [现有 Issues](https://github.com/your-org/music-player/issues)，确认该建议未被提出
- 思考该功能是否与项目定位相符

### 提交功能建议

请通过 [功能建议模板](https://github.com/your-org/music-player/issues/new?template=feature_request.md) 提交，包含以下信息:

- **功能描述**: 你想要什么功能
- **使用场景**: 这个功能解决什么问题
- **期望实现**: 你期望这个功能如何工作
- **替代方案**: 是否有其他替代方案
- **补充信息**: 截图、参考链接等额外信息

### 功能建议示例

```markdown
### 功能描述
希望支持定时停止播放功能

### 使用场景
睡前听音乐时，希望设置 30 分钟后自动停止

### 期望实现
在播放器界面添加「定时停止」按钮，支持自定义时间或预设选项（15/30/60 分钟）

### 替代方案
可以使用系统自带的定时任务，但体验不如内置功能
```

## 📞 联系我们

如果你有任何其他问题，可以通过以下方式联系:

- 创建 [Discussion](https://github.com/your-org/music-player/discussions)
- 发送邮件至 maintainers@example.com

---

再次感谢你的贡献！🎉
