import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// PWA(vite-plugin-pwa)는 사용하지 않는다. index.html 에 명시적인
// Service Worker unregister 스크립트가 있고, 푸시 알림은 별도의
// firebase-messaging-sw.js 만 사용한다. 과거 vite-plugin-pwa 가
// 생성하던 sw.js / workbox-*.js 는 build 산출물에서 더 이상 만들지
// 않으므로 캐시된 옛 SW 에서 발생하던 'Failed to update SW' 404 가
// 사라진다.
export default defineConfig({
    base: '/',
    plugins: [
        react(),
        legacy({
            targets: ['defaults', 'not IE 11'],
        }),
    ],
})
