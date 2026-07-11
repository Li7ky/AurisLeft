# 已弃用（Deprecated）

本目录为历史 **Tauri + Rust** 实现，**不再参与构建与运行**。

当前桌面端请使用项目根目录：

```bash
npm run dev      # Electron 开发
npm run dist     # 打包 Windows 安装包
```

主进程代码在 `electron/`，前端在 `src/`。

如需清理体积，可安全删除整个 `src-tauri/` 目录（含 `target/` 编译缓存）。
