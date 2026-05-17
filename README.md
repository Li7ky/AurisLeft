# AurisLeft

<div align="center">

![AurisLeft Logo](./public/logo.svg)

**一个基于 Tauri 2.x + React 19 的跨平台桌面音乐播放器**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](https://nodejs.org/)

</div>

## 📖 项目简介

AurisLeft 是一个现代化、轻量级的跨平台桌面音乐播放器，兼容洛雪音乐音源协议。采用 Tauri 2.x 作为桌面应用框架，React 19 构建用户界面，提供流畅的音乐播放体验和简洁的交互设计。

本项目旨在为用户提供一个**开源、透明、可定制**的音乐播放解决方案，支持多音源接入、歌词显示、播放列表管理等核心功能。

## ✨ 功能特性

- 🎵 **多音源支持** - 兼容洛雪音乐音源协议，可自由配置和管理音源
- 🎨 **现代 UI** - 基于 React 19 构建的响应式界面，支持明暗主题切换
- 💿 **播放控制** - 完整的播放、暂停、上一曲、下一曲、进度拖拽等功能
- 📝 **歌词显示** - 支持同步歌词滚动显示
- 📋 **播放列表** - 支持创建、编辑、删除自定义播放列表
- 🔍 **音乐搜索** - 多音源聚合搜索，快速找到想听的音乐
- 💾 **本地缓存** - 播放记录、收藏列表本地持久化存储
- 🌐 **跨平台** - 支持 Windows、macOS、Linux 三端运行
- 🔌 **插件扩展** - 预留音源插件接口，支持自定义音源开发

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **桌面框架** | [Tauri 2.x](https://tauri.app/) |
| **前端框架** | [React 19](https://react.dev/) + TypeScript |
| **构建工具** | [Vite 7](https://vite.dev/) |
| **状态管理** | [Zustand 5](https://zustand-demo.pmnd.me/) |
| **路由** | [React Router v7](https://reactrouter.com/) |
| **样式方案** | CSS |
| **代码规范** | Prettier |
| **后端语言** | Rust (Tauri Command) |

## 🚀 快速开始

### 环境要求

- **Node.js** >= 20.0.0
- **Rust** >= 1.70.0 ([安装指南](https://www.rust-lang.org/tools/install))
- **系统依赖** (参考 [Tauri 官方文档](https://tauri.app/start/prerequisites/))

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

此命令会同时启动 Vite 开发服务器和 Tauri 应用窗口，支持热重载。

### 构建发布版本

```bash
npm run build
```

构建产物将输出至 `src-tauri/target/release/bundle/` 目录。

### 前端构建预览

```bash
npm run web:build
npm run web:preview
```

## 🔌 音源配置说明

本播放器兼容洛雪音乐音源协议。音源配置文件位于：

```
~/.config/AurisLeft/sources.json   # Linux
~/Library/Application Support/AurisLeft/sources.json  # macOS
%APPDATA%\AurisLeft\sources.json   # Windows
```

### 音源配置格式

```json
{
  "sources": [
    {
      "name": "示例音源",
      "url": "https://example.com/source.js",
      "enabled": true
    }
  ]
}
```

### 添加自定义音源

1. 打开应用设置页面
2. 进入「音源管理」
3. 点击「添加音源」，填入音源 URL
4. 启用后即可在搜索和播放时使用该音源

> **注意**：音源脚本需遵循洛雪音乐音源规范，详见 [洛雪音乐音源开发文档](https://github.com/lyswhut/lx-music-doc)。

## 📸 截图

截图正在开发中，后续将补充主界面、播放页面、搜索页面和设置页面预览。

## 📄 项目协议

本项目采用 [MIT License](LICENSE) 开源协议。

你可以自由地使用、复制、修改和分发本软件，但需保留原始版权声明和许可声明。

## 🤝 贡献指南

欢迎任何形式的贡献！在参与之前，请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详细的贡献流程。

### 快速参与

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feat/amazing-feature`)
3. 提交改动 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 提交 Pull Request

### 报告问题

- [提交 Bug](https://github.com/Li7ky/AurisLeft/issues/new?template=bug_report.md)
- [功能建议](https://github.com/Li7ky/AurisLeft/issues/new?template=feature_request.md)

## 🙏 致谢

- [Tauri](https://tauri.app/) - 优秀的跨平台桌面框架
- [洛雪音乐](https://github.com/lyswhut/lx-music-desktop) - 音源协议参考来源
- [React](https://reactjs.org/) - 前端 UI 框架
- 所有参与本项目开发的贡献者

---

<div align="center">

Made by AurisLeft Contributors

</div>
