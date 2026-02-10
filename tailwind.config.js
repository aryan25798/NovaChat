/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Design System Tokens
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                surface: {
                    DEFAULT: "hsl(var(--surface))",
                    elevated: "hsl(var(--surface-elevated))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                text: {
                    1: "hsl(var(--text-1))",
                    2: "hsl(var(--text-2))",
                },
                border: "hsl(var(--border))",
                // Keep WhatsApp specifics for legacy compatibility if needed
                whatsapp: {
                    teal: "#008069",
                    light: "#25D366",
                    dark: "#075E54",
                    background: "#efeae2",
                    backgroundDark: "#0b141a",
                    chatBubbleOut: "#d9fdd3",
                    chatBubbleIn: "#ffffff",
                    chatBubbleOutDark: "#005c4b",
                    chatBubbleInDark: "#202c33",
                }
            },
            spacing: {
                '8': '8px',
                '12': '12px',
                '16': '16px',
                '24': '24px',
                '32': '32px',
                '40': '40px',
                '48': '48px',
                '64': '64px',
            },
            borderRadius: {
                'bubble': '18px',
                'bubble-sm': '12px',
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif', 'system-ui', 'ui-sans-serif'],
            },
            boxShadow: {
                'premium': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                'premium-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
            },
            animation: {
                'fade-in': 'fade-in 0.3s ease-out',
                'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            },
            keyframes: {
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'slide-up': {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [],
}
