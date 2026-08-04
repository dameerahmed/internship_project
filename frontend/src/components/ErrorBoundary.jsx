import React from 'react';
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.assign('/login');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen w-screen items-center justify-center p-6 font-display"
          style={{ background: 'var(--eds-bg)', color: 'var(--eds-text)' }}
        >
          <div
            className="flex max-w-md flex-col items-center text-center gap-5 rounded-eds-xl p-8 shadow-eds-xl animate-fade-up"
            style={{
              background: 'var(--eds-panel)',
              border: '1px solid var(--eds-border-2)',
            }}
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-eds-md"
              style={{
                background: 'var(--eds-danger-dim)',
                border: '1px solid rgba(244,63,94,0.3)',
                color: 'var(--eds-danger-2)',
              }}
            >
              <ShieldAlert size={28} />
            </div>

            <div>
              <h2 className="text-base font-extrabold" style={{ color: 'var(--eds-text)' }}>
                Application State Reset Required
              </h2>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--eds-muted)' }}>
                {this.state.error?.message || 'An unexpected client-side error occurred. Clear session data and restart console.'}
              </p>
            </div>

            <div className="flex flex-col w-full gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="eds-btn-primary w-full"
              >
                <RefreshCw size={14} />
                <span>Reload Page</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="eds-btn-ghost w-full"
              >
                <LogOut size={14} />
                <span>Clear Cache &amp; Re-login</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
