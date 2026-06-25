/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // Paperlogy 가 기본 sans 패밀리. font-sans 유틸리티 + Tailwind
            // base 가 적용되는 모든 요소에 자동 반영된다.
            fontFamily: {
                sans: [
                    'Paperlogy',
                    'system-ui',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Noto Sans KR"',
                    '"Apple SD Gothic Neo"',
                    '"Malgun Gothic"',
                    '"Segoe UI"',
                    'Roboto',
                    'Helvetica',
                    'Arial',
                    'sans-serif',
                ],
            },
        },
    },
    plugins: [],
}
