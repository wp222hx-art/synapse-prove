// React Error Boundary — 捕获 R3F / 渲染层崩溃,避免全屏白屏
// 显示一个友好的错误页 + 重新加载按钮

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || String(error) }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] render error', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen">
          <div className="error-icon">💥</div>
          <div className="error-title">出错了</div>
          <div className="error-message">{this.state.errorMessage}</div>
          <button className="error-reload" onClick={this.handleReload}>
            刷新重试
          </button>
          <div className="error-hint">如果反复出现,告诉开发者控制台错误</div>
        </div>
      )
    }
    return this.props.children
  }
}
