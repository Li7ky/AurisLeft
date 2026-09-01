import { Component, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  /**
   * 监听这些值,变化时自动清除错误状态。
   * 调用方可传 location.pathname / 关键数据 作为 resetKey,
   * 实现路由切换或数据变化时自动恢复。
   */
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** 记录上次 resetKeys,用于比较 */
  prevResetKeys?: unknown[];
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const keys = props.resetKeys ?? [];
    const keysChanged =
      state.prevResetKeys !== undefined &&
      (state.prevResetKeys.length !== keys.length ||
        state.prevResetKeys.some((k, i) => k !== keys[i]));

    // resetKeys 变化时自动恢复,避免"一次报错永久卡死"
    if (state.hasError && keysChanged) {
      return { hasError: false, error: null, prevResetKeys: keys };
    }
    // 首次或无错误:同步 prev 值,不改变 hasError
    if (state.prevResetKeys !== keys) {
      return { prevResetKeys: keys };
    }
    return null;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>出错了</h2>
          <p>应用遇到了一个意外错误。</p>
          <pre>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
