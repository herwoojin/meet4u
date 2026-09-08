# TRD — PromiseU (Meet4U) 기술 요구사항 정의서

> `PRD.md` 의 기능을 어떤 기술로 어떻게 구현하는지 정의한다.
> 데이터 모델은 `ERD.md`, AI 에이전트용 실행 지시문은 `PROMPT.md` 참조.

- **문서 버전**: 1.0
- **작성일**: 2026-09-08

---

## 1. 기술 스택

### 1.1 프론트엔드

| 영역 | 기술 | 버전 | 비고 |
|---|---|---|---|
| 런타임 | React | ^19.2.4 | 함수형 + Hooks만 사용 |
| 빌드 | Vite | ^7.3.1 | `@vitejs/plugin-react`, `@vitejs/plugin-legacy` |
| 라우팅 | react-router-dom | ^7.13.0 | **HashRouter** (정적 호스팅 대응) |
| 스타일 | Tailwind CSS | ^3.4.17 | + `clsx`, `tailwind-merge` |
| 아이콘 | lucide-react | ^0.563.0 | |
| 날짜 | date-fns | ^4.1.0 | `ko`, `enUS`, `zhCN` locale |
| 차트 | recharts | ^3.8.0 | BarChart, PieChart |
| 지도 | leaflet + react-leaflet | 1.9.4 / 5.0.0 | |
| 클러스터 | react-leaflet-cluster | ^4.1.3 | ⚠️ 아래 4.4 주의사항 |
| i18n | i18next + react-i18next | ^26 / ^17 | + `i18next-browser-languagedetector` |

### 1.2 백엔드 (BaaS + Serverless)

| 영역 | 기술 | 비고 |
|---|---|---|
| 인증 | Firebase Auth | Google Provider + Custom Token(카카오) |
| DB | Cloud Firestore | 실시간 구독 + 트랜잭션 |
| 파일 | Firebase Storage | 채팅 이미지 (WebP 압축) |
| 푸시 | Firebase Cloud Messaging | 웹 푸시 |
| 서버 로직 | Netlify Functions | ESM, `node_bundler = "esbuild"` |
| 관리 SDK | firebase-admin | ^13.7.0 (Functions 내부) |

### 1.3 외부 API

| 용도 | 서비스 | 호출 위치 |
|---|---|---|
| 번역 | Google Translate `gtx` 엔드포인트 | Netlify Function 프록시 |
| TTS | Google Translate TTS | Netlify Function 프록시 |
| 문법 분석 / 회의록 | Gemini API (`generateContent`) | 클라이언트 직접 (사용자 개인 키) |
| 실시간 통역 | Gemini Live API (WebSocket BidiGenerateContent v1beta) | 클라이언트 직접 |
| 지오코딩 | Nominatim (OpenStreetMap) | 클라이언트 직접 |
| 카카오 OAuth | Kakao REST API | Netlify Function |

---

## 2. 프로젝트 구조

```
/
├── index.html                      # PWA 메타, SW 등록, 테마 FOUC 방지
├── vite.config.js
├── tailwind.config.js
├── firebase.json                   # firestore.rules / storage.rules 경로
├── .firebaserc                     # default project id
├── firestore.rules                 # ★ 보안의 핵심
├── netlify.toml
├── public/
│   ├── manifest.json               # PWA
│   ├── sw.js                       # 캐싱 + FCM 통합 SW
│   ├── offline.html
│   ├── _headers                    # Netlify 캐시/MIME 제어
│   ├── .well-known/assetlinks.json # Android TWA
│   └── pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png
├── netlify/functions/
│   ├── send-notification.js        # FCM 발송
│   ├── translate-comment.js        # 번역 프록시
│   ├── text-to-speech.js           # TTS 프록시
│   └── kakao-login.js              # 카카오 → Firebase Custom Token
└── src/
    ├── main.jsx                    # 진입점, 딥링크 캡처, SW 정리
    ├── App.jsx                     # 라우터 + Provider 트리
    ├── index.css                   # Tailwind + 폰트 + 테마 + 이펙트
    ├── i18n/
    │   ├── index.js
    │   └── locales/{ko,en,zh}.json
    ├── context/
    │   ├── AuthContext.jsx         # 인증 + 프로필 실시간 구독
    │   ├── ProjectContext.jsx      # 프로젝트 목록 + currentProjectId
    │   └── ToastContext.jsx
    ├── lib/
    │   ├── firebase.js             # SDK 초기화
    │   ├── menuPermissions.js      # 등급/권한 로직
    │   ├── projects.js             # 프로젝트 CRUD + 마이그레이션
    │   ├── guestMeetups.js         # ★ 게스트 모집 트랜잭션
    │   ├── grammar.js              # 문법 분석 + Gemini
    │   ├── phonetics.js            # 발음 표기 변환
    │   ├── meetingMinutes.js       # 회의록 생성
    │   ├── liveApi.js              # Gemini Live WebSocket
    │   ├── kakao.js
    │   ├── googleCalendar.js
    │   ├── imageUtils.js           # WebP 압축
    │   └── capacityMonitor.js      # 서버 용량 신호등
    ├── hooks/
    │   ├── useFCM.js
    │   ├── useGeminiApiKey.js
    │   ├── useRouteTracker.js
    │   ├── useGoogleCalendar.js
    │   └── use*Notifications.js    # 인앱 알림 3종
    ├── Pages/                      # 라우트 단위 화면
    └── Components/
        ├── layout/                 # Sidebar, MainLayout, LanguageSwitcher, ServerCapacityIndicator
        ├── calendar/               # CalendarGrid, WeeklyCalendar
        ├── meeting/                # MeetingForm, MeetingDetailModal, CommentSection, ScoreBoard, AdminAttendanceEditor
        ├── guest/                  # GuestMeetupForm, GuestMeetupDetail
        ├── chat/                   # GlobalChat, GrammarPopup, LiveTranslatorModal, MeetingMinutesModal, ChatModal, ImageLightbox
        ├── admin/                  # AttendanceStats
        ├── dashboard/              # CostManagement
        └── effects/                # CelestialLoom
```

---

## 3. 아키텍처

### 3.1 Provider 트리
```jsx
<HashRouter>
  <ErrorBoundary>
    <AuthProvider>              {/* !loading 일 때만 children 렌더 */}
      <FCMInitializer />
      <ProjectProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" .../>
            <Route path="/auth/kakao/callback" .../>
            <Route path="/*" element={
              <PrivateRoute>
                <MainLayout>
                  <Routes>{/* 앱 화면들 */}</Routes>
                </MainLayout>
              </PrivateRoute>
            }/>
          </Routes>
        </ToastProvider>
      </ProjectProvider>
    </AuthProvider>
  </ErrorBoundary>
</HashRouter>
```

**AuthProvider 가 `{!loading && children}` 으로 게이팅**하는 것이 핵심. 이렇게 해야 하위 컴포넌트가 마운트될 때 `currentUser`/`userProfile` 이 이미 준비되어 있다.

### 3.2 상태 관리 원칙
- 전역 상태는 Context 3개만: Auth / Project / Toast
- 서버 상태는 별도 라이브러리 없이 **Firestore `onSnapshot` 직접 구독**
- 화면 로컬 상태는 `useState` / `useMemo`
- 사용자 설정 영속화는 `localStorage`, 세션 한정은 `sessionStorage`

### 3.3 localStorage 키 목록

| 키 | 용도 |
|---|---|
| `meet4u_current_project_id` | 현재 선택 프로젝트 |
| `meet4u_calendar_view` | `grid` \| `list` (모아보기) |
| `meet4u_sidebar_collapsed` | 사이드바 접힘 |
| `meet4u_theme` | `galaxy` \| `paper` |
| `meet4u_last_route` | 마지막 방문 경로 |
| `meet4u_gemini_api_key` | Gemini 키 (클라우드 마이그레이션 전 호환) |
| `meet4u_autoVoice` | 채팅 자동 TTS |
| `guestMeetup.lastForm` | 게스트 모집 폼 기본값 (장소·계좌·예금주는 제외) |
| `meet4u_showMap` | 지도 표시 토글 |

sessionStorage: `meet4u_admin`(관리자 세션), `guest_pending_open`(딥링크 stash)

---

## 4. 핵심 구현 상세

### 4.1 AuthContext — 프로필 실시간 구독

```js
const profileUnsubRef = useRef(null);

useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        // 이전 profile 구독 정리 (로그아웃 · 계정 전환)
        if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null; }

        setCurrentUser(user);
        if (!user) { setUserProfile(null); setLoading(false); return; }

        const userDocRef = doc(db, 'users', user.uid);
        const safeEmail = user.email || `${user.uid}@kakao.local`;

        // 1) 문서 존재 확인 · 없으면 생성. 실패해도 아래 onSnapshot 이 재시도
        try {
            const snap = await getDoc(userDocRef);
            if (!snap.exists()) {
                await setDoc(userDocRef, {
                    email: safeEmail, displayName: user.displayName, photoURL: user.photoURL,
                    role: 'user', preferredLanguage: 'ko',
                    createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(),
                    emailSanitized: safeEmail.replace(/\./g, '_'),
                });
            } else {
                setDoc(userDocRef, { lastSeen: new Date().toISOString(), photoURL: user.photoURL },
                       { merge: true }).catch(() => {});
            }
        } catch (e) {
            console.warn('[Auth] initial check failed (snapshot will retry):', e?.code);
        }

        // 2) ★ 실시간 구독 — permission-denied 자동 재시도 + role 변경 즉시 반영
        profileUnsubRef.current = onSnapshot(userDocRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setUserProfile(data);
                if (data.role === 'admin') setIsAdmin(true);
            }
            setLoading(false);
        }, (err) => { console.warn('[Auth] snapshot error:', err?.code); setLoading(false); });
    });

    return () => { unsubscribe(); if (profileUnsubRef.current) profileUnsubRef.current(); };
}, []);
```

**왜 `getDoc` 대신 `onSnapshot` 인가**: 로그인 직후 auth 토큰이 Firestore 백엔드로 완전히 전파되기 전 짧은 순간 `permission-denied` 가 날 수 있다. 일회성 read 면 `userProfile` 이 `null` 로 남아 등급 판정이 `general` 로 떨어지고, 관리자인데 메뉴가 회색으로 보인다. 새로고침하면 정상 동작하는 전형적 race condition.

### 4.2 ProjectContext

```js
useEffect(() => {
    if (!myEmail) { setProjects([]); setLoading(false); return; }
    const q = query(collection(db, 'projects'), where('memberEmails', 'array-contains', myEmail));
    return onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.deleted);
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        setProjects(list); setLoading(false);
    }, () => setLoading(false));
}, [myEmail]);

// ★ fallback — projects.length === 0 조건을 넣으면 보안 사고
useEffect(() => {
    if (loading) return;
    const found = projects.find(p => p.id === currentProjectId);
    if (!found) setCurrentProjectId(projects[0]?.id || null);
}, [projects, currentProjectId, loading]);
```

### 4.3 게스트 모집 트랜잭션 (`lib/guestMeetups.js`)

```js
export const capTotal = (m) => (m?.cap ?? 0) + 1;              // 호스트 1 + 게스트 cap
export const isRosterFull = (m) => (m?.roster?.length ?? 0) >= capTotal(m);
export const isClosed = (m) => Boolean(m?.closed) || isRosterFull(m);

export const perHead = (m) => {
    if (typeof m?.perHeadAmount === 'number' && m.perHeadAmount > 0) return Math.round(m.perHeadAmount);
    // 레거시 fallback: 총액 / capTotal, 100원 올림
    return Math.ceil(totalCost(m) / Math.max(1, capTotal(m)) / 100) * 100;
};

// 코트 번호 제거 → 필터 chip 용 prefix
export const placePrefix = (place) =>
    String(place || '')
        .replace(/\s*\d+.*$/, '')     // "충장 1번" → "충장"
        .replace(/[A-Za-z]+$/, '')    // "파주 운정A" → "파주 운정"
        .trim();

export const joinMeetup = async (id, user) => {
    const ref = doc(db, COLLECTION, id);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('없는 모임입니다.');
        const m = snap.data();

        if (findRosterIndex(m, user.uid) >= 0) return { status: 'already-in' };
        if (findWaitIndex(m, user.uid) >= 0)   return { status: 'already-waiting' };

        const name = user.displayName || user.email?.split('@')[0] || '게스트';

        if (isRosterFull(m) || m.closed) {
            const wait = [...(m.wait || []), { uid: user.uid, name, at: Date.now() }];
            tx.update(ref, { wait, updatedAt: serverTimestamp() });
            return { status: 'waiting', position: wait.length };
        }

        const newRoster = [...(m.roster || []),
            { uid: user.uid, name, host: false, paid: false, joinedAt: Date.now() }];
        const closed = newRoster.length >= (m.cap ?? 0) + 1;
        tx.update(ref, { roster: newRoster, closed, updatedAt: serverTimestamp() });
        // finalRoster/closingMessage 를 리턴해 호출측이 알림 대상을 정확히 안다
        return { status: 'joined', closed, finalRoster: newRoster, closingMessage: m.closingMessage || '' };
    });
};

export const leaveMeetup = async (id, user) => {
    const ref = doc(db, COLLECTION, id);
    return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const m = snap.data();
        const idx = findRosterIndex(m, user.uid);
        if (idx < 0) return { status: 'not-in' };
        if (m.roster[idx].host) throw new Error('호스트는 취소할 수 없습니다.');

        let roster = (m.roster || []).filter((_, i) => i !== idx);
        let wait = m.wait || [];
        let promoted = null;

        const cap = m.cap ?? 0;
        if (roster.length < cap + 1 && wait.length > 0) {
            const [head, ...rest] = wait;
            promoted = head;
            roster = [...roster, {
                uid: head.uid, name: head.name, host: false, paid: false,
                joinedAt: Date.now(),
                promotedFromWait: true, promotedAt: Date.now(),   // ← UI 뱃지용 마킹
            }];
            wait = rest;
        }

        tx.update(ref, { roster, wait, closed: roster.length >= cap + 1, updatedAt: serverTimestamp() });
        return { status: 'left', promoted };
    });
};
```

### 4.4 지도 — react-leaflet-cluster 호환 주의 ⚠️

`<MarkerClusterGroup>` 자식 `<Marker>` 에 callback ref 를 붙이면
**react-leaflet 5.x + react-leaflet-cluster 4.1.3** 조합에서 크래시:
```
TypeError: VM is not a constructor
```
클러스터가 자식 마커를 재래핑하는 과정에서 forwardRef 계약이 깨지기 때문.

**우회 방법** — ref 대신 `useMap()` + `eachLayer()` 좌표 매칭:
```jsx
const OpenPinPopup = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (!target) return;
        const t = setTimeout(() => {
            map.eachLayer((layer) => {
                if (typeof layer.getLatLng !== 'function' || typeof layer.openPopup !== 'function') return;
                const ll = layer.getLatLng();
                if (Math.abs(ll.lat - target.lat) < 1e-5 && Math.abs(ll.lng - target.lng) < 1e-5) {
                    layer.openPopup();
                }
            });
        }, 1300);   // flyTo 애니메이션(1.2s) 이후
        return () => clearTimeout(t);
    }, [target, map]);
    return null;
};
```

### 4.5 TTS 청킹 (200자 제한 대응)

Google Translate TTS 는 요청당 약 200자 제한. 그대로 자르면 문장이 중간에 끊긴다.

```js
const chunkTextForTTS = (text, maxLen = 190) => {
    const out = [];
    const sentences = String(text).split(/(?<=[.!?。！？…])\s+/);  // 1차: 문장 경계
    for (const raw of sentences) {
        let s = raw.trim();
        if (!s) continue;
        if (s.length <= maxLen) { out.push(s); continue; }
        while (s.length > maxLen) {                                  // 2차: 콤마/세미콜론
            const win = s.slice(0, maxLen + 1);
            let cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '),
                               win.lastIndexOf('、'), win.lastIndexOf('，'));
            if (cut < 40) cut = win.lastIndexOf(' ');                 // 3차: 공백
            if (cut < 40) cut = maxLen;                               // 4차: 강제 컷
            out.push(s.slice(0, cut + 1).trim());
            s = s.slice(cut + 1).trim();
        }
        if (s) out.push(s);
    }
    return out.filter(Boolean);
};

// HTMLAudioElement 유사 인터페이스 컨트롤러 반환 → 기존 호출부와 호환
const playGoogleTTS = (text, lang) => {
    const chunks = chunkTextForTTS(text, 190);
    let idx = 0, currentAudio = null, stopped = false, playedOne = false;
    const handlers = { onended: null, onerror: null };

    const playNext = () => {
        if (stopped) return Promise.resolve();
        if (idx >= chunks.length) { handlers.onended?.(); return Promise.resolve(); }
        const audio = new Audio(buildUrl(chunks[idx++]));
        currentAudio = audio;
        audio.onended = () => { playedOne = true; currentAudio = null; playNext(); };
        audio.onerror = () => {
            currentAudio = null;
            // 앞 청크가 이미 재생됐으면 조용히 종료(재시작 방지)
            playedOne ? handlers.onended?.() : handlers.onerror?.();
        };
        return audio.play().catch((err) => { if (playedOne) handlers.onended?.(); else throw err; });
    };

    return {
        get onended() { return handlers.onended; }, set onended(fn) { handlers.onended = fn; },
        get onerror() { return handlers.onerror; }, set onerror(fn) { handlers.onerror = fn; },
        play: playNext,
        pause() { stopped = true; try { currentAudio?.pause(); } catch(_) {} currentAudio = null; },
    };
};
```

### 4.6 Gemini 모델 fallback

`gemini-1.5-flash` 는 v1beta 에서 제거되어 404(NOT_FOUND) 반환. 모델 fallback 필수.

```js
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-1.5-flash-latest',
];

for (const model of GEMINI_MODELS) {
    const res = await fetch(`${endpointFor(model)}?key=${key}`, { method:'POST', body });
    if (res.ok) return await res.json();
    const errText = await res.text();
    // 404/NOT_FOUND 만 다음 모델로. 인증·rate limit 오류는 즉시 중단
    if (!(res.status === 404 || /not found|NOT_FOUND/i.test(errText))) break;
}
```

Gemini **Live API** 는 별도 모델 목록:
```js
const LIVE_MODELS = [
    'gemini-2.0-flash-live-001',
    'gemini-live-2.5-flash-preview',
    'gemini-2.5-flash-preview-native-audio-dialog',
];
```
※ Live API 는 **`AIza` 형식 키만 허용**. AI Studio 의 `AQ.` OAuth 토큰은 1008 unregistered caller 오류.

### 4.7 Gemini 키 관리 (`useGeminiApiKey`)

우선순위: **Firestore(`users/{uid}.geminiApiKey`) → localStorage → 관리자 공유 키(env)**

```js
const cloudKey = (userProfile?.geminiApiKey || '').trim();
const lsKey    = localStorage.getItem('meet4u_gemini_api_key') || '';
const adminKey = import.meta.env.VITE_GEMINI_ADMIN_API_KEY || '';

const key = cloudKey || lsKey || (isAdmin ? adminKey : '');
const source = cloudKey ? 'cloud' : lsKey ? 'local' : (isAdmin && adminKey ? 'admin' : 'none');

// 자동 마이그레이션: localStorage 에만 있던 키를 Firestore 로 승격
useEffect(() => {
    if (!currentUser || !lsKey || cloudKey) return;
    if (!looksLikeKey(lsKey)) return;
    updateUserProfile({ geminiApiKey: lsKey }).catch(() => {});
}, [currentUser, lsKey, cloudKey]);
```

### 4.8 푸시 알림 — 중복 방지 3중 방어선

**(1) 서버: Topic 헤더**
```js
const sanitizeTopic = (tag) =>
    String(tag || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'default';

webpush: {
    headers: {
        Urgency: 'high',
        TTL: '86400',
        ...(tag ? { Topic: sanitizeTopic(tag) } : {}),
    },
    // notification 필드 제거 — data-only 로 보내야 브라우저 자동 알림이 안 뜸
}
```

**(2) SW: 안정 태그**
```js
messaging.onBackgroundMessage((payload) => {
    const tag = payload.data?.tag || payload.data?.type || 'general';  // ← Date.now() 금지
    self.registration.showNotification(title, {
        body, icon:'/pwa-192x192.png', badge:'/pwa-192x192.png',
        tag,                 // 같은 tag = 브라우저가 자동 교체
        renotify: true,      // 교체하되 알림음은 다시
        data: { type, tag, url: payload.data?.url || '/' },
        vibrate: [200, 100, 200],
    });
});
```

**(3) 클라이언트: 명시적 정리**
```js
// SW
self.addEventListener('message', (event) => {
    if (event.data?.type === 'CLEAR_NOTIF') {
        const tag = event.data.tag;
        event.waitUntil(
            self.registration.getNotifications(tag ? { tag } : {})
                .then(list => list.forEach(n => n.close()))
        );
    }
});

// 채팅방 진입 시
navigator.serviceWorker.controller?.postMessage({
    type: 'CLEAR_NOTIF', tag: `chat-${roomId}`
});
```

**Netlify Function 입력 스펙**
```jsonc
{
  "type": "chat|attendance|guest-join|guest-full|guest-promoted",
  "title": "알림 제목",
  "body": "알림 본문",
  "url": "/chat-check",             // 클릭 시 이동
  "tag": "chat-<roomId>",           // 안정 dedup 키
  "recipientEmails": ["a@b.com"],   // 또는
  "recipientUids": ["uid1"],        // uid 기반 (게스트 모집)
  "senderEmail": "me@b.com",        // 자기 자신 제외
  "senderUid": "myuid"
}
```

### 4.9 딥링크 (게스트 모집 공유)

URL 형식: `https://<도메인>/#/guest-meetups?open=<meetupId>`

로그인 필요 상태면 `PrivateRoute` 가 `/login` 으로 리다이렉트하면서 쿼리가 유실된다.
→ **앱 마운트 전에 미리 stash**:

```js
// main.jsx — ReactDOM.createRoot 이전
try {
    const m = (window.location.hash || '').match(/[?&]open=([^&]+)/);
    if (m?.[1]) sessionStorage.setItem('guest_pending_open', decodeURIComponent(m[1]));
} catch (_) {}
```

```js
// GuestMeetups.jsx
useEffect(() => {
    let openId = new URLSearchParams(location.search).get('open') || '';
    if (!openId) {
        openId = sessionStorage.getItem('guest_pending_open') || '';
        if (openId) sessionStorage.removeItem('guest_pending_open');
    }
    if (openId) setDetailId(openId);
}, [location.search]);
```

### 4.10 i18n 설정

```js
i18n.use(LanguageDetector).use(initReactI18next).init({
    resources: { ko: { translation: ko }, en: { translation: en }, zh: { translation: zh } },
    fallbackLng: 'ko',
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
});
```

**두 종류의 "언어"를 혼동하지 말 것**
| 구분 | 저장 위치 | 값 | 영향 |
|---|---|---|---|
| UI 언어 | localStorage (i18next) | ko / en / zh | 버튼·라벨 등 화면 텍스트 |
| 내 언어 | `users/{uid}.preferredLanguage` | 20종 | 받는 채팅 메시지의 번역 타깃 |

---

## 5. Firestore 보안 규칙

전체는 `ERD.md` 부록 참조. 핵심 패턴만:

```javascript
function isSignedIn() { return request.auth != null; }
function myUid()      { return request.auth.uid; }
function myEmail()    { return request.auth.token.email.lower(); }
function isAdmin() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/users/$(myUid()))
    && get(/databases/$(database)/documents/users/$(myUid())).data.role == 'admin';
}
function onlyAffects(fields) {
  return request.resource.data.diff(resource.data).affectedKeys().hasOnly(fields);
}
```

**게스트 모집 — 참가/취소를 허용하되 다른 필드는 막는 패턴**
```javascript
match /guestMeetups/{id} {
  allow read: if isSignedIn();
  allow create: if isSignedIn() && request.resource.data.createdBy == myUid();
  allow update: if isSignedIn() && (
       resource.data.createdBy == myUid()   // 호스트: 무제한
    || isAdmin()                            // 관리자: 무제한 (장소 일괄 rename 등)
    || request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['roster','wait','closed','updatedAt'])   // 참가자: 4개 필드만
  );
  allow delete: if isSignedIn() && (resource.data.createdBy == myUid() || isAdmin());
}
```

**대화방 — 멤버만 read, 비소유자는 "나가기"만 허용**
```javascript
match /globalChatRooms/{roomId} {
  allow read: if isSignedIn() && myEmail() in resource.data.members;
  allow update: if isSignedIn() && (
       resource.data.createdBy == myEmail()
    || ( myEmail() in resource.data.members
      && onlyAffects(['members'])
      && !(myEmail() in request.resource.data.members) )   // 본인 제거만
  );
}
```

**배포**
```bash
firebase deploy --only firestore:rules
```

---

## 6. Netlify Functions

### 6.1 공통 설정
```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  node_bundler = "esbuild"
  directory = "netlify/functions"
```

### 6.2 환경변수

| 키 | 용도 |
|---|---|
| `FIREBASE_PROJECT_ID` | Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Admin SDK |
| `FIREBASE_PRIVATE_KEY` | Admin SDK (`\n` 이스케이프 처리 필요) |
| `KAKAO_REST_API_KEY` | 카카오 OAuth |
| `KAKAO_CLIENT_SECRET` | 카카오 OAuth (설정 시 필수) |
| `VITE_FIREBASE_*` | 클라이언트 SDK |
| `VITE_ADMIN_ID` | 관리자 로그인 ID |
| `VITE_ADMIN_PASSWORD_HASH` | SHA-256 hex |
| `VITE_GEMINI_ADMIN_API_KEY` | 관리자 공유 Gemini 키 (선택) |
| `VITE_GOOGLE_CALENDAR_CLIENT_ID` | 구글 캘린더 (선택) |

```js
// private key 개행 복원
privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
```

### 6.3 `_headers`
```
/*
  Cache-Control: public, max-age=0, must-revalidate

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache, no-store
  Service-Worker-Allowed: /

/manifest.json
  Cache-Control: no-cache
  Content-Type: application/manifest+json

/.well-known/assetlinks.json
  Content-Type: application/json
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

---

## 7. PWA 구현

### 7.1 index.html 필수 요소
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#1a1a2e">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="PromiseU">

<!-- 카카오톡 링크 카드 -->
<meta property="og:type" content="website">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="/pwa-512x512.png">

<!-- 테마 FOUC 방지 (렌더 전 동기 실행) -->
<script>
  try {
    var t = localStorage.getItem('meet4u_theme');
    if (t === 'galaxy' || t === 'paper') document.documentElement.classList.add('theme-' + t);
  } catch (_) {}
</script>

<!-- SW 등록 + 레거시 정리 -->
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.getRegistrations())
      .then(regs => regs?.forEach(r => {
        const url = r.active?.scriptURL || '';
        if (url && !url.endsWith('/sw.js')) r.unregister();   // 옛 SW 정리
      }))
      .catch(err => console.warn('[PWA] SW registration failed:', err));
  });
}
</script>
```

### 7.2 sw.js 구조
```js
const CACHE_NAME = 'promiseu-v1';
const PRECACHE_URLS = ['/', '/index.html', '/offline.html', '/manifest.json',
                       '/pwa-192x192.png', '/pwa-512x512.png'];

// install: 프리캐시 (실패해도 activate 진행)
// activate: 오래된 캐시 정리 (firestore* 는 보존)
// fetch: Network-First. api/firestore/googleapis/gstatic 은 캐시 제외.
//        navigate 요청 실패 → offline.html
// FCM: importScripts(firebase-app-compat, firebase-messaging-compat)
//      onBackgroundMessage → 안정 태그로 showNotification
// notificationclick → data.url 로 focus/openWindow
// message → CLEAR_NOTIF 처리
```

### 7.3 Android TWA
1. PWABuilder(`pwabuilder.com`)에서 배포 URL 입력 → Android 패키지 생성
2. 생성된 `assetlinks.json` 을 `public/.well-known/assetlinks.json` 에 배치
3. 검증: `https://<도메인>/.well-known/assetlinks.json` 이 JSON 으로 응답하는지 확인
4. APK 설치 후 주소창이 숨겨지면 성공

---

## 8. 배포 파이프라인

```
git push origin main
   ↓
Netlify 자동 빌드 (npm run build → dist/)
   ↓
CDN 배포 (1~2분)
```

Firestore 규칙은 별도:
```bash
firebase deploy --only firestore:rules
```

---

## 9. 알려진 함정 (Pitfalls)

| # | 증상 | 원인 | 해결 |
|---|---|---|---|
| P-01 | 관리자인데 메뉴가 회색, 새로고침하면 정상 | `getDoc` 프로필 조회가 permission-denied 로 실패 | `onSnapshot` 으로 전환 |
| P-02 | 같은 계정인데 브라우저마다 메뉴가 다름 | `useMenuPermissions` 가 auth 준비 전에 구독 시도 후 재시도 없음 | `onAuthStateChanged` 안에서 구독 시작 |
| P-03 | 신규 가입자가 남의 프로젝트 일정을 봄 | `ProjectContext` fallback 이 `projects.length === 0` 에서 early-return | 조건 제거 + 캘린더에 멤버십 게이트 추가 |
| P-04 | 지도 페이지 크래시 `VM is not a constructor` | 클러스터 내부 `<Marker ref>` | `useMap()` + `eachLayer()` 우회 |
| P-05 | 긴 문장 TTS 가 중간에 끊김 | 200자 초과분을 잘라버림 | 문장 단위 청킹 후 순차 재생 |
| P-06 | Gemini 404 NOT_FOUND | `gemini-1.5-flash` deprecated | 모델 fallback 리스트 |
| P-07 | 알림이 계속 쌓임 | SW 태그에 `Date.now()` | 안정 태그 + Topic + CLEAR_NOTIF |
| P-08 | 관리자 일괄 수정이 permission-denied | rules update 에 `isAdmin()` 누락 | rules 조건 추가 후 재배포 |
| P-09 | 폼 placeholder 대신 이전 실명이 채워짐 | localStorage defaults 가 민감 필드까지 저장 | 계좌·예금주·장소는 defaults 제외 |
| P-10 | 공유 텍스트 숫자가 화면과 불일치 | 화면은 `cap`, 공유는 `capTotal` 사용 | 게스트 기준으로 통일 |
| P-11 | SW 404 / 캐시 충돌 | 여러 세대의 SW 공존 | 등록 후 `/sw.js` 외 전부 unregister |

---

## 10. 개발 명령어

```bash
npm install
npm run dev        # Vite dev server
npm run build      # dist/ 생성
npm run preview    # 빌드 결과 로컬 확인

firebase login
firebase deploy --only firestore:rules
```
