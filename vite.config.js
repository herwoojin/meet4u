import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import legacy from '@vitejs/plugin-legacy'

// https://vitejs.dev/config/
export default defineConfig({
    base: '/', // Base URL for Vercel/Netlify deployment
    plugins: [
        react(),
        legacy({
            targets: ['defaults', 'not IE 11'],
        }),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
            manifest: {
                name: 'Meet4U - Meeting Scheduler',
                short_name: 'Meet4U',
                description: 'Schedule your meetings easily',
                theme_color: '#ffffff',
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
                globPatterns: ['**/*.{js,css,html,ico,png,svg}']
            }
        })
    ],
})
