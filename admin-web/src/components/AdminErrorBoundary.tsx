import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null; errorId: string };

export default class AdminErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: '' };

  static getDerivedStateFromError(error: Error): State {
    const errorId = `ADM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    return { error, errorId };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminErrorBoundary]', this.state.errorId, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <h1 className="text-xl font-extrabold text-[#0b2447]">MySheba Admin needs to reload</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">A page failed to render. No financial action was completed by this error boundary.</p>
          <p className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-500">Error ID: {this.state.errorId}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#0b2447] px-4 py-2 text-sm font-bold text-white">Reload Admin</button>
        </div>
      </div>
    );
  }
}
