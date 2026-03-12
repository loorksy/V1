import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="bg-card p-8 rounded-2xl shadow-lg max-w-md w-full text-center border border-border">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">حدث خطأ غير متوقع</h2>
            <p className="text-muted-foreground text-sm mb-4">
              {this.state.error?.message || 'حدث خطأ أثناء تحميل الصفحة'}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <RefreshCw className="w-5 h-5" />
              <span>حاول مرة أخرى</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
