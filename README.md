# AurisLeft 音乐播放器

基于 **Electron + React** 的跨平台桌面音乐播放器。

> **当前开发分支：`测试版`**（beta）  
> 版本号：`0.2.0-beta`  
> 用于联调、体验与反馈。**正式版改完后再上线**（建议合入 `main` / `正式版` 后发版）。

## 功能

- 多平台聚合搜索（网易云曲库接口 + 可开关的洛雪兼容 JSON/JS 音源）
- 播放队列、随机/循环、音质切换、音量记忆、睡眠定时（渐弱暂停）
- 收藏、最近播放、歌单管理
- 本地音乐扫描（元数据 + 内嵌封面 + 同名 LRC 歌词）
- 下载管理（带平台 Referer、流式写盘）
- 关闭窗口最小化到托盘

## 环境

- Node.js 20+

### Electron 安装（国内镜像）

若 `npm install` 后缺少 `electron.exe`：

```bash
# PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
# 或手动安装
node node_modules/electron/install.js
```

也可下载：

```text
https://cdn.npmmirror.com/binaries/electron/v<version>/electron-v<version>-win32-x64.zip
```

解压到 `node_modules/electron/dist/`。

## 开发

```bash
npm install
npm run dev
```

## 打包

```bash
npm run dist
```

输出目录：`release/`（NSIS 安装包）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 壳 | Electron 35 |
| UI | React 19 + TypeScript + Vite 7 |
| 状态 | Zustand |
| 主进程 | Node.js（CommonJS） |
| 存储 | 用户目录 JSON（原子写） |

> 历史 Tauri 实现见 `src-tauri/DEPRECATED.md`，已不参与构建。可安全删除整个 `src-tauri/` 目录以减小体积。

## 开源协议

MIT
