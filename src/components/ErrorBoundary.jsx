import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("Uncaught error:", error, errorInfo);

        // AUTO-RECOVERY for lazy loading failures
        if (error.name === 'ChunkLoadError' || error.message?.includes('Loading chunk')) {
            console.warn("ChunkLoadError detected. Attempting auto-reload...");
            window.location.reload();
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-900 text-white p-6 text-center">
                    <h2 className="text-2xl font-bold mb-4">Something went wrong.</h2>
                    <p className="text-slate-400 mb-6">The application encountered an unexpected error.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-full transition-colors"
                    >
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
