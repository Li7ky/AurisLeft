# AurisLeft

自用桌面音乐播放器 · **v1.0.0**

## 能做什么

- **搜歌 / 播放**：多平台搜歌，队列、随机、循环
- **整理**：收藏、最近播放、歌单
- **本地 / 下载**：扫本地文件夹，也能把歌下到电脑
- **其它**：关窗进托盘、睡眠定时、主题切换、数据备份

## 下载

都在 [Releases](https://github.com/Li7ky/AurisLeft/releases) 同一页：

| 版本 | 说明 |
|---|---|
| **[v1.0.0 正式版](https://github.com/Li7ky/AurisLeft/releases/tag/v1.0.0)** | **推荐**，日常使用下这个 |
| [v0.2.0-beta 测试版](https://github.com/Li7ky/AurisLeft/releases/tag/v0.2.0-beta) | 早期测试包，不推荐日常用 |

## 怎么用

1. 下载安装包，安装后打开  
2. 顶部搜索框搜歌，点一首就能听  
3. 左侧进收藏、歌单、本地音乐；右下角可开队列和歌词  
4. 需要改主题、下载目录、备份等 → **设置**

个别歌播不了时会自动试其它来源；仍不行就换一首。

## 开发

```bash
cd zuoer
npm install
npm run dev      # 开发
npm run dist     # 打 Windows 安装包
```

## 数据

- 歌单、收藏、设置等在 Electron `userData`
- 备份：设置 → 数据与诊断 → 导出 / 导入
- 日志：设置 → 打开日志目录
