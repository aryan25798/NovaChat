// Console Error Filter - Suppress expected errors during logout
// This prevents console spam from harmless Firebase behavior

const originalError = console.error;
const originalWarn = console.warn;

// Patterns for expected errors that should be suppressed
const SUPPRESSED_ERROR_PATTERNS = [
    'Missing or insufficient permissions',
    'permission-denied',
    'Auth session listener error',
    'Location update failed: FirebaseError: Missing or insufficient permissions'
];

const SUPPRESSED_WARN_PATTERNS = [
    'Cross-Origin-Opener-Policy policy would block',
    'Location tracking stopped: Permission denied',
    'Auth session listener: Permission denied'
];

console.error = function (...args) {
    const message = args.join(' ');

    // Check if this is a suppressed error
    const shouldSuppress = SUPPRESSED_ERROR_PATTERNS.some(pattern =>
        message.includes(pattern)
    );

    if (!shouldSuppress) {
        originalError.apply(console, args);
    } else {
        // Log to debug instead
        console.debug('[Suppressed Error]:', ...args);
    }
};

console.warn = function (...args) {
    const message = args.join(' ');

    // Check if this is a suppressed warning
    const shouldSuppress = SUPPRESSED_WARN_PATTERNS.some(pattern =>
        message.includes(pattern)
    );

    if (!shouldSuppress) {
        originalWarn.apply(console, args);
    } else {
        // Log to debug instead
        console.debug('[Suppressed Warning]:', ...args);
    }
};

// Note: COOP errors from Firebase Auth are browser-level and can't be suppressed
// They are harmless warnings about popup behavior and don't affect functionality
