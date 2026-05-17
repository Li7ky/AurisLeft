# AurisLeft

<div align="center">

![AurisLeft Logo](./public/logo.svg)

**简洁、轻量的跨平台桌面音乐播放器**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)

</div>

## 项目介绍

AurisLeft 是一款基于 Tauri 2 和 React 19 构建的桌面音乐播放器，专注于本地化、轻量化和清爽的音乐播放体验。

它支持多音源搜索、在线播放、歌词、歌单、下载、本地音乐管理和基础播放控制，适合在 Windows 桌面环境中作为日常音乐播放器使用。

## 主要功能

- 多音源聚合搜索与播放
- 播放、暂停、上一首、下一首、进度拖动、音量控制
- 歌词获取与显示
- 自定义歌单管理
- 音乐下载与下载进度查看
- 本地音乐目录扫描与播放
- 睡眠定时器
- 明暗主题与现代桌面界面

## 下载安装

Windows 安装包可在 GitHub Releases 页面下载：

```text
AurisLeft_0.1.0_x64-setup.exe
```

## 开发运行

### 环境要求

- Node.js 20+
- Rust
- Tauri 2 所需系统依赖

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 构建安装包

```bash
npm run build
```

构建产物位于：

```text
src-tauri/target/release/bundle/
```

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 状态管理 | Zustand 5 |
| 后端 | Rust |
| 数据存储 | SQLite |

## 音源说明

AurisLeft 支持兼容洛雪音乐音源协议的 JS 音源。用户可以在设置页导入和管理音源。

音源配置文件位置：

```text
Windows: %APPDATA%\AurisLeft\sources.json
macOS: ~/Library/Application Support/AurisLeft/sources.json
Linux: ~/.config/AurisLeft/sources.json
```

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
