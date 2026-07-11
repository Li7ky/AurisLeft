# AurisLeft

跨平台桌面音乐播放器（当前为 **测试版** `0.2.0-beta`）。

## 功能

- 多平台聚合搜索，音源可单独开关
- 播放队列、随机 / 循环、音质切换
- 收藏、最近播放、歌单管理
- 本地音乐扫描与播放
- 下载管理
- 托盘驻留、睡眠定时
- 深色 / 明亮主题

## 下载

Windows 安装包见 [Releases](https://github.com/Li7ky/AurisLeft/releases)。

## 开发

环境要求：Node.js 20+

```bash
npm install
npm run dev
```

国内若 Electron 下载失败，可先设置镜像再安装：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 打包

```bash
npm run dist
```

安装包输出到 `release/` 目录。

## 说明

- 当前为测试版，功能与体验仍在迭代
- 部分曲目可能受版权或音源限制无法播放
- 正式版完成后会另行发布

## 开源协议

[MIT](./LICENSE)
