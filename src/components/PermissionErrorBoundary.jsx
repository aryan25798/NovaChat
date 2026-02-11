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
            // Gracefully degrade - render children anyway
            // This prevents the entire app from crashing
            return this.props.children;
        }

        return this.props.children;
    }
}

export default PermissionErrorBoundary;
