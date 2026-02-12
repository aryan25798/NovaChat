import React from 'react';

class PermissionErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        // Check if it's a Firebase permission error
        if (error?.code === 'permission-denied' ||
            error?.message?.includes('permission') ||
            error?.message?.includes('Missing or insufficient permissions')) {
            return { hasError: true, error };
        }
        // Let other errors propagate
        return null;
    }

    componentDidCatch(error, errorInfo) {
        // Log permission errors silently
        if (error?.code === 'permission-denied') {
            console.debug('Permission error caught by boundary:', error.code);
        } else {
            console.error('Error caught by boundary:', error, errorInfo);
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-4 bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/50 rounded-lg m-2">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">Permission denied or session expired.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-2 text-xs text-red-700 dark:text-red-300 underline hover:no-underline"
                    >
                        Try Refreshing
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default PermissionErrorBoundary;
