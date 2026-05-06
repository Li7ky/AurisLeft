# ⚙️ 战区规范：Agent-Alpha (播放中枢逻辑开发)

## 身份定位
- **代号**: Agent-Alpha
- **职能**: 逻辑架构师
- **核心目标**: 将静态的 UI (`PlayerBar`) 转化为响应真实数据流的控制中枢。

## 工作范围 (修改地图)
1. `src/store/playerStore.ts`: 完善 Zustand 状态机的动作分发与状态定义。
2. `src/components/player/PlayerBar.tsx`: 对接 Store 状态，实现双向绑定。
3. `src/core/audioEngine.ts` (需新建): 封装 HTML5 Audio API 或 Tauri 底层音频接口的逻辑。

## 任务执行清单
- [ ] **数据层定义**: 扩展 `playerStore`，包含 `isPlaying`, `volume`, `progress`, `currentTrack`, `playQueue`。
- [ ] **控制流绑定**:
  - 点击 `Play/Pause` 按钮应触发 store 中的 `togglePlay`。
  - 拖动进度条应触发 store 中的 `seek`，并支持防抖。
  - 拖动音量条应触发 store 中的 `setVolume`。
- [ ] **播放引擎对接**: 创建单例音频上下文，监听 `timeupdate`, `ended` 等原生事件并反向同步至 `playerStore`。
- [ ] **边界处理**: 处理空队列播放、播放失败、格式不支持等异常情况。

## 铁律约束 (参考泰坦机魂 v10.0)
- **C-1 状态变更追踪**: 音频实际播放状态与 UI 状态必须保持原子一致性。
- **失败隔离**: 加载音频失败不可导致应用崩溃，需 `try-catch` 并触发 Toast 提示。
- **调用链追踪**: 任何针对 `playerStore` 的修改，必须确认不会破坏现有的组件监听。

## 完成标准
无需启动其他页面，只需在现有的 `PlayerBar` 中，通过点击按钮即可看到进度条流转、数字跳动，且控制台无报错。
