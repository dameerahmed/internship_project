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
        <div className="flex min-h-screen w-screen items-center justify-center bg-[#090d16] p-6 text-gray-100 font-sans">
          <div className="flex max-w-md flex-col items-center text-center gap-5 rounded-3xl border border-gray-800 bg-gray-900/90 p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
              <ShieldAlert size={28} />
            </div>
            
            <div>
              <h2 className="text-lg font-bold text-gray-100">Application State Reset Required</h2>
              <p className="mt-1.5 text-xs text-gray-400">
                {this.state.error?.message || 'An unexpected client-side error occurred. Clear session data and restart console.'}
              </p>
            </div>

            <div className="flex flex-col w-full gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-xs font-bold text-gray-950 transition active:scale-95 shadow-md"
              >
                <RefreshCw size={14} />
                <span>Reload Page</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-800 bg-gray-950 hover:bg-gray-800 px-5 py-2.5 text-xs font-semibold text-gray-300 transition active:scale-95"
              >
                <LogOut size={14} />
                <span>Clear Cache & Re-login</span>
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
