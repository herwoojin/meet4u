import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import legacy from '@vitejs/plugin-legacy'

// https://vitejs.dev/config/
export default defineConfig({
    base: '/', // Absolute base path for root deployment
    plugins: [
        react(),
        legacy({
            targets: ['defaults', 'not IE 11'],
        }),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.png', 'apple-touch-icon.png', 'mascot-bg.png'],
            manifest: {
                name: 'Meet4U - Meeting Scheduler',
                short_name: 'Meet4U',
                description: 'Schedule your meetings easily',
                theme_color: '#1a1a2e',
                background_color: '#1a1a2e',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ],
                start_url: '/',
                scope: '/',
                display: 'standalone'
            },
            devOptions: {
                enabled: false // Disable SW in dev to prevent caching issues
            },
            workbox: {
                cleanupOutdatedCaches: true,
                skipWaiting: true,
                clientsClaim: true,
                importScripts: ['firebase-messaging-sw-custom.js'], // Added for FCM background push
                globPatterns: ['**/*.{html,ico,png,svg}'],
                navigateFallback: 'index.html',
                navigateFallbackDenylist: [/^\/api/, /^\/\.netlify/],
                runtimeCaching: [
                    {
                        // JS/CSS만 NetworkFirst로 캐싱 (Firestore/FCM 웹소켓은 건드리지 않음)
                        urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:js|css)$/.test(url.pathname),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'assets-cache',
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60,
                            },
                        },
                    },
                ],
            }
        })
    ],
})
