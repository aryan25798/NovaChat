import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
    'process.env.VITE_FIREBASE_API_KEY': JSON.stringify(process.env.VITE_FIREBASE_API_KEY),
    'process.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN),
    'process.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID),
    'process.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(process.env.VITE_FIREBASE_STORAGE_BUCKET),
    'process.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    'process.env.VITE_FIREBASE_APP_ID': JSON.stringify(process.env.VITE_FIREBASE_APP_ID),
    'process.env.VITE_FIREBASE_DATABASE_URL': JSON.stringify(process.env.VITE_FIREBASE_DATABASE_URL),
    '__VITE_FIREBASE_API_KEY__': JSON.stringify(process.env.VITE_FIREBASE_API_KEY || 'AIzaSyAtqHwOk2zwqdmr_3puMCVH_aAmzx0GtTI'),
    '__VITE_FIREBASE_AUTH_DOMAIN__': JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN || 'whatsappclone-50b5b.firebaseapp.com'),
    '__VITE_FIREBASE_PROJECT_ID__': JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID || 'whatsappclone-50b5b'),
    '__VITE_FIREBASE_STORAGE_BUCKET__': JSON.stringify(process.env.VITE_FIREBASE_STORAGE_BUCKET || 'whatsappclone-50b5b.firebasestorage.app'),
    '__VITE_FIREBASE_MESSAGING_SENDER_ID__': JSON.stringify(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '662334343258'),
    '__VITE_FIREBASE_APP_ID__': JSON.stringify(process.env.VITE_FIREBASE_APP_ID || '1:662334343258:web:a1b7a9fe49563c9aeaf063'),
    '__VITE_FIREBASE_DATABASE_URL__': JSON.stringify(process.env.VITE_FIREBASE_DATABASE_URL || 'https://whatsappclone-50b5b-default-rtdb.firebaseio.com'),
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
})
