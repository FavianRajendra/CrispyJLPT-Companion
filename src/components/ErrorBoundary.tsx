import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-xl mx-auto my-12 p-6 md:p-8 glass-card border border-rose-500/30 rounded-[var(--card-radius)] text-center shadow-glass">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-primary mb-2">View Encountered an Issue</h2>
          <p className="text-sm text-primary-muted mb-4">
            A rendering error occurred in this tab. Your offline SQLite study progress and FSRS data remain completely safe.
          </p>

          {this.state.error && (
            <div className="p-3 mb-6 rounded-xl bg-black/40 border border-border-glass text-left text-xs font-mono text-rose-300 overflow-x-auto max-h-32">
              {this.state.error.message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={this.handleReset}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-neon-glow"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset to Present View</span>
            </button>

            <button
              onClick={this.handleReload}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl glass-panel hover:bg-surface-hover text-primary-muted hover:text-primary text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
