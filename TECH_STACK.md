# Meet4U (PromiseU) — 기술 스택

> 약속·모임 스케줄러 PWA. React 19 + Vite 7 SPA 를 Firebase(Auth·Firestore·Storage·FCM) 와
> Netlify Functions 위에 올린 **서버리스 전면 무료** 구성.
>
> **마지막 업데이트: 2026-10-24** · 머신 판독용 원본: [`techstack.json`](./techstack.json)
> (두 파일은 항상 같은 커밋에서 함께 갱신한다.)

---

## 1. 아키텍처

```mermaid
flowchart TD
    subgraph Client["브라우저 / PWA (설치형 · Android TWA)"]
        UI["React 19 SPA<br/>HashRouter · Tailwind · i18next"]
        SW["Service Worker<br/>Workbox 캐시 + FCM 백그라운드"]
        OCR["Tesseract.js<br/>(동적 import · 클라이언트 OCR)"]
    end

    subgraph Netlify["Netlify (정적 + Functions)"]
        CDN["정적 자산 CDN"]
        FN1["translate-comment"]
        FN2["text-to-speech"]
        FN3["send-notification"]
        FN4["kakao-login"]
    end

    subgraph Firebase["Firebase"]
        AUTH["Authentication<br/>Google · Kakao Custom Token"]
        FS[("Cloud Firestore<br/>onSnapshot · runTransaction")]
        ST[("Storage")]
        FCM["Cloud Messaging"]
    end

    subgraph Ext["외부 API (키 없음 또는 개인 무료 키)"]
        GT["Google Translate gtx<br/>번역 · 로마자 · TTS"]
        GEM["Gemini<br/>Vision · Live · 문법분석"]
        OSM["OpenStreetMap 타일"]
    end

    UI -->|SDK 직접| AUTH
    UI -->|실시간 구독| FS
    UI --> ST
    UI --> CDN
    UI --> FN1 & FN2 & FN3 & FN4
    UI --> OSM
    OCR -.->|저신뢰 시 폴백| GEM
    UI --> GEM
    FN1 & FN2 --> GT
    FN3 -->|firebase-admin| FCM
    FCM -->|푸시| SW
    SW -.->|캐시 응답| UI
```

핵심 성질 세 가지:

1. **자체 서버가 없다.** 상태는 전부 Firestore 에 있고, 클라이언트가 SDK 로 직접 읽고 쓴다.
   접근 통제는 애플리케이션 코드가 아니라 `firestore.rules` 가 최종 책임을 진다.
2. **Netlify Functions 는 프록시 역할만 한다.** CORS 우회(번역·TTS), 비밀키가 필요한 작업
   (FCM 전송, 카카오 토큰 교환)만 서버로 내보낸다.
3. **HashRouter 를 쓴다.** 다중 호스팅(Netlify/Vercel/Firebase/gh-pages)에서 rewrite 설정
   없이도 딥링크가 깨지지 않게 하기 위한 선택이다.

---

## 2. 카테고리별 상세

### 프론트엔드 — 코어 런타임/번들러

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **React** | ^19.2.4 | UI 컴포넌트/상태 관리(서버 컴포넌트 X, 클라이언트만) | — |
| **ReactDOM** | ^19.2.4 | DOM 렌더링 | — |
| **Vite** | ^7.3.1 | 개발 서버/빌드 도구(ES 모듈 기반) | — |
| **@vitejs/plugin-react** | ^5.1.4 | Vite용 React Fast Refresh/JSX 지원 | — |
| **@vitejs/plugin-legacy** | ^7.2.1 | 구형 브라우저(특히 오래된 안드로이드/iOS WebView) 대응 폴리필 + 레거시 번들 생성 | — |
| **vite-plugin-pwa** | ^1.2.0 | Service Worker 생성, PWA manifest, Workbox runtime caching, FCM SW 통합 | vite.config.js — registerType: autoUpdate, NetworkFirst for js/css, importScripts firebase-messaging-sw-custom.js |

### 프론트엔드 — UI/스타일/아이콘

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Tailwind CSS** | ^3.4.17 | 유틸리티 우선 스타일링 | tailwind.config.js + postcss.config.js |
| **PostCSS** | ^8.5.6 | Tailwind 처리용 CSS 트랜스파일러 | — |
| **autoprefixer** | ^10.4.24 | 벤더 프리픽스 자동 추가 | — |
| **lucide-react** | ^0.563.0 | SVG 아이콘 라이브러리(메뉴/벨/달력 등) | — |
| **Paperlogy (한글 가변형 폰트)** | fonts-archive/Paperlogy @main | 전체 페이지 기본 폰트. 9개 weight(100~900) 모두 jsDelivr CDN 으로 woff2 로드, font-display: swap. Tailwind 의 기본 sans 패밀리에 등록되어 모든 텍스트가 자동 적용. | src/index.css (@font-face × 9), tailwind.config.js (theme.extend.fontFamily.sans), index.html (preconnect jsDelivr + splash font-family) |
| **clsx** | ^2.1.1 | 조건부 className 결합 | — |
| **tailwind-merge** | ^3.4.0 | 충돌하는 Tailwind 클래스 병합 | — |
| **Galaxy/Paper 테마** | in-repo | 사용자 선택형 화면 테마 2종(우주/종이) — index.html에서 사전 클래스 적용 | index.html inline script, document.documentElement.classList.add('theme-galaxy'\|'theme-paper') |

### 프론트엔드 — 라우팅/i18n/날짜

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **react-router-dom** | ^7.13.0 | SPA 라우팅(Dashboard/Profile/Settings/AdminPage/GlobalMeetingMap 등) | — |
| **i18next** | ^26.0.6 | 다국어 코어 | — |
| **react-i18next** | ^17.0.4 | React 바인딩(useTranslation) | — |
| **i18next-browser-languagedetector** | ^8.2.1 | 브라우저 언어 자동 감지(zh-CN→zh fallback 등) | — |
| **지원 언어** | ko/en/zh | 한국어/영어/중국어 UI 번역 | src/i18n/locales/{ko,en,zh}.json |
| **글로벌 채팅 번역 지원 언어 (19개)** | in-repo | 글로벌 채팅 메시지 번역 대상 언어: 기존 12개(ko/en/ja/zh-CN/ru/es/vi/mn/ar/fr/km) + 신규 8개(bn 방글라데시·uz 우즈베크·si 신할라·my 미얀마·tl 필리핀·th 태국·id 인니·ne 네팔). LANG_LABEL/LANG_FLAG/SPEECH_LOCALE 사전에 모두 등록. 목록 자체는 src/lib/languages.js 단일 출처이며 프로필 화면과 채팅 헤더 셀렉터가 같은 배열을 공유한다. UI 언어(i18next ko/en/zh)와는 별개 개념 — users/{uid}.preferredLanguage 는 '내가 받을 번역 언어' 다. | src/lib/languages.js (SUPPORTED_LANGUAGES/shortLangLabel), src/Pages/Profile.jsx, src/Components/chat/GlobalChat.jsx 헤더 셀렉터, src/Pages/MobileHome.jsx 프로필 카드 |
| **date-fns** | ^4.1.0 | 날짜 포맷/계산(미팅/달력) | — |

### 프론트엔드 — 지도/시각화

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Leaflet** | ^1.9.4 | 오픈소스 지도 코어(글로벌 미팅 맵) | — |
| **react-leaflet** | ^5.0.0 | React 바인딩 | — |
| **leaflet.markercluster** | ^1.5.3 | 마커 클러스터링 | — |
| **react-leaflet-cluster** | ^4.1.3 | react-leaflet용 클러스터 래퍼 | — |
| **recharts** | ^3.8.0 | 출석 통계 차트(AdminPage 등) | — |
| **모임 장소 ↔ 지도 핀 연결 + k-road 길안내 (in-repo)** | in-repo | 새 모임 예약의 장소 칸에서 '저 여기 있어요' 지도 핀(globalPins)을 드롭다운으로 고르면 좌표를 meetings.locationPin 에 저장. 모임 팝업은 미리보기 지도(Leaflet, 조작 잠금)로 위치를 보여 주고, 누르면 /global-meeting?focus=위도,경도 로 이동해 그 핀을 확대·팝업. 핀 팝업의 '도착지로 길안내'는 k-road.asia/?navTo=위도,경도&navName=이름 을 새 탭으로 열어 현재 위치 → 핀 좌표 고속도로·추천 경로 + 주행 모드까지 자동 실행. 예전 모임은 장소 이름이 같은 핀으로 연결. | src/lib/globalPins.js (useGlobalPins 공용 구독/kroadNavUrl/pinMapPath), src/Components/meeting/MeetingForm.jsx (LocationPicker), src/Components/meeting/MeetingLocationCard.jsx, src/Pages/GlobalMeetingMap.jsx (?focus 처리, 길안내 버튼) |

### 백엔드 — 서버리스 함수(Netlify Functions)

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Netlify Functions** | esbuild bundler | API 엔드포인트 호스팅(서버 없음/이벤트 기반) | netlify.toml — directory=netlify/functions, node_bundler=esbuild |
| **translate-comment.js** | in-repo | Google Translate 무료 엔드포인트 프록시(댓글 자동 번역, API 키 없음) | — |
| **text-to-speech.js** | in-repo | Google Translate TTS 프록시(CORS 우회, 댓글 읽어주기) | — |
| **send-notification.js** | in-repo | Firebase Admin SDK 기반 FCM 푸시 전송 | — |
| **firebase-admin** | ^13.7.0 | 서버리스 함수에서 FCM 전송/Firestore 어드민 접근 | FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY 환경변수 |
| **google-translate-api-x** | ^10.7.2 | 함수 의존성으로 등록되어 있음(현재 코드는 fetch로 translate.googleapis.com 직접 호출). 미사용 시 추후 정리 후보. | — |
| **guest-card.js** | in-repo | 게스트 모집 카드 이미지(1200×600 PNG)를 모임마다 서버에서 그림 — 장소·날짜·시간·NTRP·유형·모집 상태·1인당 금액. 카카오톡 공유 카드의 imageUrl 과 링크 미리보기 og:image 가 같은 URL(?c=<id>.<버전>)을 쓴다. 버전이 현재 내용과 같을 때만 1년 캐시, 실패 시 정적 배너로 302. | netlify/functions/guest-card.js, netlify/lib/shareCard.js(렌더), netlify/lib/publicDocs.js(Admin SDK 조회, preferRest) |
| **guest-og.js** | in-repo | 공유 링크 /?guest=<id> 요청 시 index.html 의 og 태그를 그 모임 제목·일시·금액·카드 이미지로 바꿔 반환 → 링크를 붙여넣어도 모임별 미리보기 카드가 뜬다. 실패해도 원본 index.html(최악은 해시 딥링크 302)로 앱 진입은 유지. | netlify/functions/guest-og.js, netlify.toml 의 query={guest} force 리다이렉트(SPA catch-all 보다 위) |
| **meeting-card.js** | in-repo | 정기 모임 카톡 공유 카드 이미지(1200×600 PNG) — 제목·날짜·시간·참석/불참/미응답 수. 참석자 이름·비용은 넣지 않음(링크만 있으면 볼 수 있는 미리보기). 숨김 모임·없는 ID 는 정적 배너로 302. | netlify/functions/meeting-card.js, netlify/lib/shareCard.js renderMeetingCard, src/lib/meetingSummary.js |
| **meeting-og.js** | in-repo | 정기 모임 링크 /?meeting=<id>.<버전> 의 og 태그를 그 모임 내용으로 교체(public/_redirects 쿼리 매칭). 열면 로그인 후 MeetingLinkOpener 가 프로젝트 멤버 확인 뒤 상세 팝업(참석·불참 저장)을 띄운다. | netlify/functions/meeting-og.js, netlify/lib/ogHtml.js(공용 og 교체·폴백), src/Components/meeting/MeetingLinkOpener.jsx |
| **meeting-reminders.js (예약 함수 · 5분마다)** | in-repo | 정기 모임 참석자에게 시작 1시간 전 알림(누르면 그 모임 팝업), 30분 전 '위치 공유가 켜져요' 알림(누르면 저 여기 있어요에서 자동 공유). 같은 알림은 meetings.reminders.{h1\|m30} 에 그때의 시작 시각을 적어 한 번만 — 시간이 바뀌면 새 기준으로 재발송. 종료 후엔 아무것도 보내지 않고, 자동으로 켜졌던 위치 공유(liveLocations.autoUntil 지남)를 서버가 지운다. 판단 로직(planReminders)은 순수 함수로 분리해 드라이런 가능. 게스트 모집도 참가자(roster uid)에게 시작 1시간 전 알림(guestMeetups.reminders.h1, 위치 공유는 프로젝트 기반이라 제외). 참석·참가·대기 클릭 시 src/lib/pushPrompt.js 의 ensurePushOn 으로 알림 권한을 요청한다. | netlify/functions/meeting-reminders.js, netlify.toml [functions."meeting-reminders"] schedule, netlify/lib/pushSend.js(사용자 조회·발송·만료 토큰 정리), netlify/lib/adminApp.js(Admin 앱·Firestore preferRest 공용), src/lib/meetingTime.js(KST 시각 계산) |
| **satori** | ^0.63.2 | 카드 이미지 레이아웃 → SVG (guest-card). 이모지는 그리지 못해 쓰지 않음. | netlify/lib/shareCard.js |
| **@resvg/resvg-wasm** | 2.6.2 (고정) | SVG → PNG. wasm 은 cold start 때 jsDelivr 에서 받으므로 npm 버전과 반드시 일치시켜 고정. | netlify/lib/shareCard.js WASM_URL |

### AI/외부 API — 무료 엔드포인트 위주

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Google Translate (무공식 gtx)** | translate.googleapis.com/translate_a/single | 댓글 자동 번역. API 키 없이 client=gtx 호출 — 무료지만 비공식이며 레이트 리밋 위험. | — |
| **Google Translate dt=rm (romanization)** | translate.googleapis.com/translate_a/single?dt=rm | 비라틴 문자(한·중·일·아랍·러시아·태국 등) 타겟의 발음 표기를 라틴 문자로 반환. | — |
| **Google Translate TTS** | translate.googleapis.com/translate_tts | 텍스트→음성 합성(텍스트 ~200자/요청). | — |
| **Google Calendar API** | via @firebase Auth googleProvider scope | Google 로그인 토큰으로 Calendar 읽기/쓰기 | src/lib/googleCalendar.js, hooks/useGoogleCalendar.js |
| **라틴 → 한글 음차 (in-repo)** | in-repo | 프랑스어/영어/독일어/스페인어/이탈리아어/포르투갈어/베트남어 등 라틴 문자 타겟에 대해 한글 발음 가이드 생성. dt=rm이 빈 값을 돌려주는 경우의 fallback. | src/lib/phonetics.js (latinToHangul/getPronunciationDisplay), netlify/functions/translate-comment.js (서버 측 미러) |
| **언어 공부 엔진 (in-repo, studyPipeline)** | in-repo | 챗.첵 메시지 '문법 분석' 팝업. 한국어 원문이 있으면 원문을 빈 줄 기준 단락 → Intl.Segmenter 문장으로 나눠 문장마다 따로 번역(원문은 그대로 유지, 백번역 없음). 단어는 Intl.Segmenter(중·일 ICU 사전) + 일본어 활용어미 병합(とても·です·食べました) + 중국어 대명사 분리로 실제 단어 단위로 나누고, Google gtx dt=t·bd·rm 으로 뜻·품사·다른 뜻·발음을 채운다. 영어 기능어·일본어 조사·중국어 허사는 사전 뜻 대신 문맥 설명, 영어 숙어(in charge of 등) 표시. 실패 시 3회 재시도. API 키 없이 동작. | src/lib/studyPipeline.js (buildStudy/lookupWord/segmentWords/splitParagraphs), src/lib/grammar.js (ZH_FUNC_WORDS·getLanguageDisplay·Gemini 정밀 분석 유지) |
| **병음·로마자 → 한글 발음 (in-repo)** | in-repo | 중국어 병음은 성모·운모 음절 단위로, 일본어 로마자는 음절(ん=ㄴ받침, っ=ㅅ받침) 단위로 나눠 자모를 조합해 한글 발음을 만든다(Jīntiān → 진톈, gakkō → 갓코). 영어는 철자와 발음이 달라 한글로 적지 않고 브라우저 음성(speechSynthesis)으로 들려준다. | src/lib/phonetics.js (pinyinToHangul/romajiToHangul), src/Components/chat/StudyCards.jsx (speak) |
| **오늘의 공부 PDF 학습지** | in-repo | GrammarPopup 상단 버튼으로 새 창을 띄워 문장 카드(원문 → 번역/뜻 → 발음 → 단어표: 단어·읽기·뜻·품사·조사 설명·다른 뜻)를 단락별로 A4(14mm 여백)에 정렬하고 window.print()로 PDF 저장. 단어 뜻이 다 채워진 뒤 활성화. 외부 PDF 라이브러리 없음. | src/Components/chat/StudyCards.jsx (buildStudyPrintHtml/openStudyPrint), @page A4 |
| **문장별 학습 카드 UI** | in-repo | [① 원문 → 번역(또는 한국어 뜻) → 발음(로마자 + 한글) → 📌 숙어 → 단어 칩] 카드를 단락별로 표시. 문장 듣기·단어 누르면 듣기(speechSynthesis), 번역 오류 가능성(직함·이름) 안내 + Gemini 정밀 분석 연결. | src/Components/chat/StudyCards.jsx (StudyCards/SentenceCard/WordChip), src/Components/chat/GrammarPopup.jsx |
| **Gemini API (옵션 정밀 분석)** | gemini-2.5-flash → 2.0-flash → flash-latest 폴백 | 관리자 모드 사용자는 VITE_GEMINI_ADMIN_API_KEY(공유)를 사용. 일반 사용자는 GrammarPopup의 ⚙️ 키 등록으로 본인 무료 키를 localStorage에 저장하여 업그레이드 분석 사용. | .env (VITE_GEMINI_ADMIN_API_KEY, gitignored), localStorage(meet4u_gemini_api_key), src/lib/grammar.js (analyzeWithGemini/getGeminiKey) |
| **Gemini Live API (실시간 양방향 통역)** | gemini-2.0-flash-exp | wss://generativelanguage.googleapis.com BidiGenerateContent 로 마이크 PCM 16kHz 입력 → 모델이 상대 언어로 통역하여 24kHz PCM 또는 텍스트로 응답. WebAudio API 로 캡처/리샘플/재생 큐 직접 구현, 외부 SDK 없음. 키는 grammar.js 의 getGeminiKey({isAdmin}) 공유. | src/lib/liveApi.js (LiveTranslatorSession 클래스), src/Components/chat/LiveTranslatorModal.jsx, GlobalChat 헤더의 Radio 아이콘 버튼 |
| **Tesseract.js (무료 클라이언트 OCR)** | ^7.0.0 | 예약 완료 문자 스크린샷을 브라우저 안에서 kor+eng 인식. API 키·서버 비용 0원. 언어 데이터(~15MB)는 최초 1회 CDN 다운로드 후 IndexedDB 캐시. 번들이 커서 사용 시점에만 동적 import. | src/lib/ocrReservation.js (ocrWithTesseract/parseReservations), src/Components/meeting/OcrImportModal.jsx |
| **Gemini Vision (OCR 폴백)** | gemini-2.5-flash → 2.0-flash → flash-latest 폴백 | Tesseract 인식률이 낮을 때 이미지에서 예약 건을 JSON 배열로 직접 구조화 추출. 사용자 개인 무료 키 사용. | src/lib/ocrReservation.js (ocrWithGemini), 키는 grammar.js getGeminiKey 공유 |
| **Kakao JavaScript SDK (카카오톡 공유)** | 2.8.4 (t1.kakaocdn.net, SRI sha384 고정) | 게스트 모집을 카톡방에 이미지 카드(피드 템플릿)로 공유. 카드 버튼은 https://<도메인>/?guest=<id> 로 연결되고 main.jsx 가 /#/guest-meetups?open=<id> 로 바꿔 상세 팝업을 연다. SDK 는 상세 팝업이 열릴 때만 동적 로드(88KB). 카드 이미지는 guest-card 함수가 모임별로 그린다. 키가 없거나 로드 실패 시 링크 한 줄만 복사(붙여넣으면 guest-og 미리보기 카드가 뜸). | src/lib/kakaoShare.js (loadKakaoSdk/shareGuestMeetupToKakao/summarizeMeetup/guestShareText), src/Components/guest/GuestMeetupDetail.jsx 하단 노란 버튼, public/share/guest-invite.jpg (함수 실패 시 폴백 배너), .env VITE_KAKAO_JS_KEY + Kakao Developers Web 사이트 도메인 등록 필요 |
| **Google Fonts CSS API (Noto Sans KR 서브셋)** | fonts.googleapis.com css2?text= | 카드 이미지에 쓰인 글자만 잘라 TTF 로 받음(약 30KB). 함수 번들에 수 MB 한글 폰트를 넣지 않기 위함. 실패 시 정적 배너로 폴백. | netlify/lib/shareCard.js loadFont |

### 인증/접근제어

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Firebase Authentication (Google Provider)** | firebase ^12.9.0 | Google OAuth 로그인. prompt:'select_account' 강제. | src/lib/firebase.js |
| **관리자 보호** | in-repo | VITE_ADMIN_ID + SHA-256 해시(VITE_ADMIN_PASSWORD_HASH)로 어드민 페이지 가드 | .env / .env.example |
| **메뉴별 권한** | in-repo | 사용자별 사이드바 메뉴 노출 권한 매핑 | src/lib/menuPermissions.js |

### 데이터/스토리지(Firebase)

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Cloud Firestore** | firebase ^12.9.0 | 유저/약속/댓글/출석/채팅 등 모든 사용자 데이터 | firestore.rules, firestore.indexes.json |
| **Firebase Storage** | firebase ^12.9.0 | 사진/이미지 업로드(약속 첨부, 프로필) | storage.rules — bucket: gen-lang-client-0283055211.firebasestorage.app |
| **Firebase Analytics** | firebase ^12.9.0 | 사용 통계(measurementId: G-D210VT6KP7) | — |
| **Firebase Cloud Messaging(FCM)** | firebase ^12.9.0 | 푸시 알림. 백그라운드 SW와 통합. | public/firebase-messaging-sw.js, public/firebase-messaging-sw-custom.js, src/hooks/useFCM.js |

### Firebase 무료 티어 한도(현재 결제 플랜 미사용 가정)

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Firestore 저장소** | 1 GiB | 총 문서 데이터 크기 — 초과 시 추가 과금 | — |
| **Firestore 일일 읽기** | 50,000회/일 | 초과 시 차단/지연 — 신호등이 모니터 | — |
| **Firestore 일일 쓰기** | 20,000회/일 | 댓글/출석/채팅 폭주 시 위험 | — |
| **Firestore 일일 삭제** | 20,000회/일 | 동일 | — |
| **Storage 저장소** | 5 GiB | 업로드 이미지 누적 한도 | — |
| **Storage 다운로드** | 1 GiB/일 | 이미지 노출 시 대역폭 한도 | — |
| **FCM** | 무제한(공식) | 단, 함수 호출 횟수와 페이로드 크기에 영향 | — |

### Netlify 무료 티어 한도

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Functions 호출** | 125,000회/월 | translate/tts/send-notification 모두 합산 | — |
| **Functions 실행 시간** | 100시간/월 | GCT(Compute time) | — |
| **대역폭** | 100 GB/월 | 정적 자산 + 함수 응답 | — |

### 호스팅/배포

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Netlify** | primary | 정적 호스팅 + Functions | netlify.toml, netlify/functions/* |
| **Vercel** | secondary | 대체 호스팅. SPA fallback rewrites + 캐시 헤더 설정만 있고 API는 없음. | vercel.json |
| **Firebase Hosting** | secondary | rules/indexes 배포(firestore.rules, storage.rules)에 사용. 정적 호스팅도 가능. | firebase.json, .firebase/ |
| **gh-pages** | ^6.3.0 (devDep) | GitHub Pages 배포 보조 스크립트(`npm run deploy`) | — |

### PWA/오프라인

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **Service Worker** | Workbox(via vite-plugin-pwa) | 오프라인 캐시 + FCM 백그라운드 수신 알림을 누르면 앱이 열려 있어도 그 알림의 화면으로 이동(client.navigate) — 예전엔 앞으로만 가져왔다. /경로 형태 url 은 /#/경로 로 바꿔 연다. | vite.config.js workbox 섹션 |
| **Web App Manifest** | in-repo | PWA 설치 가능. start_url=/, display=standalone, theme #1a1a2e | — |
| **PWA 아이콘** | 192/512px | 홈 화면 아이콘 — 웰컴 이미지(welcome-splash.jpg, 테니스 코트 일러스트)를 정사각형으로 잘라 192/512/180/64px 생성. manifest·index.html 의 아이콘 주소에 ?v=2 를 붙여 설치된 앱도 새 아이콘을 다시 받게 함 | public/pwa-192x192.png, public/pwa-512x512.png, apple-touch-icon.png, favicon.png |
| **앱 설치 버튼 (PWA 설치 유도)** | in-repo | 모바일 헤더 언어 설정 옆 원형 버튼. 안드로이드 크롬·삼성 인터넷은 beforeinstallprompt 로 바로 설치 창, iOS 는 공유 → 홈 화면에 추가 안내, 카카오톡 인앱은 kakaotalk://web/openExternal 로 외부 브라우저 열기, 기타 인앱(네이버·인스타 등)은 다른 브라우저로 열기 + 링크 복사. 홈 화면 앱(standalone·TWA)으로 실행 중이면 숨김. | src/lib/pwaInstall.js (main.jsx 에서 렌더 전 이벤트 캡처), src/Components/layout/InstallAppButton.jsx, MainLayout 모바일 헤더 |
| **모임 기반 위치 자동 공유** | in-repo | 참석한 모임의 [시작 30분 전, 종료) 동안 '저 여기 있어요'를 열어 두면 위치 공유가 자동으로 켜지고(공유 대상은 그 모임 프로젝트만) 종료 시각에 꺼진다. 직접 끄면 그 모임 동안 다시 켜지지 않음. 브라우저는 앱이 닫힌 상태에서 위치를 읽을 수 없어 30분 전 알림으로 화면을 열게 하고, 앱을 닫아 둔 채 끝나도 서버가 종료 후 공유를 지운다. | src/Pages/GlobalMeetingMap.jsx, src/lib/meetingTime.js, liveLocations.autoUntil |

### 관찰성/신뢰성

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **ServerCapacityIndicator** | in-repo (이 커밋에 신설) | Firestore 읽기/쓰기, Storage 업로드, Netlify Functions 호출 회수를 LocalStorage 카운터로 추적하고, 무료 티어 대비 사용률을 신호등(녹/주/적) + 배터리 UI로 우측 하단에 상시 표시. | src/Components/layout/ServerCapacityIndicator.jsx, src/lib/capacityMonitor.js |

### 산출물/임시 자산

| 이름 | 버전 | 용도 | 위치·설정 |
|---|---|---|---|
| **dist/** | build output | Vite 빌드 결과(배포 대상) | — |
| **_backup/, temp_*.jsx** | snapshots | 이전 버전 백업/임시 파일(레거시 후보) | — |
| **build_error.log, .vite_output.log** | runtime logs | 디버그 로그(레거시 후보) | — |
---

## 3. 왜 이걸 골랐나

| 선택 | 대안 | 고른 이유 |
|---|---|---|
| **Firebase Firestore** | Supabase, 직접 운영 Postgres | `onSnapshot` 실시간 구독이 이 앱의 핵심(출석 토글·채팅·게스트 모집 마감)이라 폴링 없이 즉시 반영된다. 무료 티어로 동호회 규모를 충분히 감당한다. |
| **HashRouter** | BrowserRouter | 호스팅을 옮겨도 rewrite 설정이 필요 없다. SEO 가 필요 없는 로그인 전용 앱이라 해시 URL 의 단점이 없다. |
| **Netlify Functions** | Firebase Cloud Functions | Cloud Functions 는 Blaze(종량제) 플랜이 필요하다. Netlify 무료 티어로 같은 일을 하면서 카드 등록을 피했다. |
| **Tesseract.js (OCR 1순위)** | Google Vision, Gemini 단독 | 완전 무료·오프라인·키 불필요. 예약 문자는 날짜/시간 같은 정형 숫자가 핵심이라 한글 인식률이 다소 낮아도 파서가 보완한다. |
| **Gemini Vision (OCR 폴백)** | — | Tesseract 가 0건을 내면 구조화 추출로 넘긴다. 사용자 개인 무료 키라 운영자 비용이 0이다. |
| **Google Translate `client=gtx`** | 공식 Cloud Translation API | 키 없이 무료. 비공식이라는 리스크는 아래 한계 항목 참고. |
| **Leaflet + OSM** | Google Maps, Kakao Map | 타일 사용료와 키 관리가 없다. |
| **Paperlogy (jsDelivr CDN)** | 로컬 폰트 번들 | 9개 weight 를 번들에 넣으면 빌드가 무거워진다. `font-display: swap` 으로 FOUT 만 감수. |

---

## 4. 외부 의존 서비스 — 헬스·요금 영향

무료 티어만 사용하므로 **한도 초과 = 기능 정지**다. 그래서 우측 하단 배터리 신호등
(`ServerCapacityIndicator`)이 사용률을 상시 표시한다. 서버리스라 `/api/server-health` 가
없으므로 `localStorage` 일·월 카운터로 추정한다.

| 서비스 | 무료 한도 | 초과 시 | 감시 방법 |
|---|---|---|---|
| Firestore 읽기 | 50,000회/일 | 읽기 차단 → 화면 빈 상태 | `capacityMonitor.js` 일 카운터 |
| Firestore 쓰기 | 20,000회/일 | 출석·채팅 저장 실패 | 동일 |
| Firestore 저장소 | 1 GiB | 쓰기 거부 | 콘솔 수동 확인 |
| Storage 저장소 / 다운로드 | 5 GiB / 1 GiB·일 | 이미지 로드 실패 | 업로드 바이트 누적 카운터 |
| Netlify Functions | 125,000회/월 · 100시간/월 | 번역·TTS·푸시 정지 | `window.fetch` 래핑 자동 집계 |
| Netlify 대역폭 | 100 GB/월 | 사이트 정지 | Netlify 대시보드 |
| Gemini (개인 키) | 계정별 무료 티어 | 429 → 분석/OCR 폴백 실패 | 호출부 에러 표면화 |
| Google Translate gtx | 공식 한도 없음(비공식) | 레이트 리밋 시 번역 미동작 | 실패 시 원문 표시 |
| FCM | 사실상 무제한 | — | — |
| 카카오톡 공유 (JS SDK) | 앱별 쿼터(디벨로퍼스 콘솔) | 공유 창이 안 열림 → 링크 복사 폴백 | 콘솔 쿼터 화면 |
| 카드 이미지 런타임 의존 (Google Fonts · jsDelivr wasm) | 공식 한도 없음 | 카드가 정적 배너로 대체(공유 자체는 정상) | 함수 로그 `[guest-card]` |

신호등 임계값은 모든 메트릭 사용률 중 worst 기준 40 / 70 / 90 %.

---

## 5. 알려진 한계

- **Google Translate `client=gtx` 는 비공식 엔드포인트다.** 구글이 언제든 차단할 수 있다.
  차단되면 번역이 조용히 실패하고 원문이 그대로 보인다. 공식 Cloud Translation API 로
  갈아탈 자리는 `netlify/functions/translate-comment.js` 한 곳이다.
- **보안 경계는 전적으로 `firestore.rules` 다.** 클라이언트가 DB 에 직접 접근하므로, UI 에서
  가리는 것만으로는 데이터가 보호되지 않는다. 프로젝트 범위 데이터(예약자 목록·캘린더·채팅
  초대)는 과거 실제로 누출된 전력이 있다. 쿼리를 바꿀 때는 규칙도 같이 본다.
- **`react-leaflet` 5.x + `react-leaflet-cluster` 4.1.3 은 호환이 깨져 있다.**
  `<MarkerClusterGroup>` 안의 `<Marker>` 에 `ref` 를 달면 `TypeError: VM is not a constructor`
  로 페이지 전체가 죽는다. 팝업 제어는 `useMap()` + 좌표 매칭으로 우회한다.
- **Tesseract 언어 데이터가 최초 1회 약 15 MB 다.** 모바일 데이터에서는 첫 OCR 이 느리다.
  이후에는 IndexedDB 캐시로 빨라진다.
- **번들이 약 1.8 MB(gzip 552 kB)로 크다.** 현재 코드 분할은 Tesseract 동적 import 뿐이다.
- **`node_modules` 가 저장소에 추적되고 있다.** `git add -A` 를 쓰면 수천 건의 허위 삭제가
  스테이징된다. 항상 파일 경로를 명시해서 add 한다.
- **UI 언어와 번역 언어가 서로 다른 개념이다.** i18next 의 UI 언어는 ko/en/zh 3종이고,
  `users/{uid}.preferredLanguage` 는 채팅 번역 대상 19종이다. 후자를 바꿀 수 없으면 모두가
  `ko` 로 남아 한국어→한국어 번역이 건너뛰어지므로 "번역이 안 된다"로 보인다.
- **카카오톡 공유는 도메인 등록이 전제다.** Kakao Developers 의 Web 사이트 도메인에 없는
  도메인에서 공유하면 SDK 초기화나 카드 링크가 거부된다. 도메인을 추가하면 콘솔에도 같이 넣는다.
  카드 이미지는 카카오가 URL 기준으로 캐시하므로, 배너를 바꾸면 파일명이나 `?v=` 를 바꿔야 반영된다.
- **카드 이미지 함수는 Firestore 를 REST(`preferRest`)로 읽는다.** esbuild 번들에서 gRPC 모듈이
  깨져 `GrpcClient is not a constructor` 로 실패하기 때문. Admin SDK 로 Firestore 를 쓰는 함수를
  새로 만들 때도 같은 설정이 필요하다.
- **카톡은 링크 미리보기를 URL 단위로 캐시한다.** 이미 붙여넣었던 `?guest=` 링크는 모임 내용이
  바뀌어도 옛 미리보기가 남을 수 있다(카카오 디벨로퍼스의 캐시 초기화 도구로 갱신). SDK 카드는
  내용이 바뀌면 이미지 URL 버전이 바뀌어 항상 새로 그려진다.
- **모임 알림은 예약 함수가 5분마다 돈다.** 월 약 8,640회로 Netlify Functions 무료 한도(125,000회/월)의
  약 7%를 쓴다. 알림이 최대 5분 늦을 수 있다(1시간 전 알림이 55~60분 전에 도착).
- **위치 자동 공유는 '저 여기 있어요' 화면이 열려 있을 때만 켜진다.** 브라우저·PWA 는 앱이 닫힌 상태에서
  위치를 읽을 수 없다. 그래서 30분 전 알림으로 화면을 열게 하고, 끝나는 처리는 서버(autoUntil)가 맡는다.
- **`_backup/`, `temp_*.jsx`, `build_error.log` 등 레거시 파일이 남아 있다.** 정리 후보.
