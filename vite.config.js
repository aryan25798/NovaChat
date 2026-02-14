/* eslint-env node */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Final Deployment Trigger
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Build-time validation for environment variables (Moved inside to access 'env')
  if (mode === 'production') {
    const requiredEnv = [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
      'VITE_FIREBASE_APP_ID'
    ];
    const missing = requiredEnv.filter(key => !env[key]);
    if (missing.length > 0) {
      console.warn(`[Build Warning] Missing secrets: ${missing.join(', ')}. App may crash.`);
      // We don't throw here to allow build to proceed if secrets are injected some other way (e.g. CI)
    }
  }

  return {
    base: '/',
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'nova-icon.png'],
        manifest: {
          name: 'Nova',
          short_name: 'Nova',
          description: 'AI-Powered Messaging',
          theme_color: '#1e293b',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          icons: [
            {
              src: '/nova-icon.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/nova-icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          screenshots: [
            {
              src: "/nova-icon.png",
              sizes: "512x512",
              type: "image/png",
              form_factor: "wide",
              label: "Desktop"
            },
            {
              src: "/nova-icon.png",
              sizes: "512x512",
              type: "image/png",
              form_factor: "narrow",
              label: "Mobile"
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/upload\.wikimedia\.org\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'external-assets-cache',
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'firebase-storage-images',
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        injectManifest: {
          rollupOptions: {
            output: {
              manualChunks: undefined
            }
          },
          injectionPoint: 'self.__WB_MANIFEST',
        }
      })
    ],
    define: {
      // Force explicit injection for critical variables
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY || ""),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN || ""),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID || ""),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET || ""),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ""),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID || ""),
      'import.meta.env.VITE_FIREBASE_DATABASE_URL': JSON.stringify(env.VITE_FIREBASE_DATABASE_URL || ""),
      'import.meta.env.VITE_FIREBASE_VAPID_KEY': JSON.stringify(env.VITE_FIREBASE_VAPID_KEY || ""),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || ""),
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY || ""),
    },
    build: {
      target: 'esnext',
      minify: 'terser',
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database', 'firebase/storage', 'firebase/messaging', 'firebase/functions'],
            'ui-vendor': ['framer-motion', 'lucide-react', 'react-virtuoso'],
            'utils-vendor': ['date-fns', 'clsx', 'tailwind-merge'],
          }
        }
      }
    },
    server: {
      port: 5173,
      host: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    preview: {
      port: 4173,
      host: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    }
  };
});
