# 🔧 카카오 로그인 트러블슈팅 가이드

> **해결일:** 2026-07-07  
> **증상:** 카카오 로그인 동의 후 "확인하고 계속하기"를 누르면 다시 로그인 화면으로 돌아감  
> **근본 원인:** `HashRouter` + OAuth 리다이렉트 경로 불일치  
> **수정 파일:** `src/main.jsx`

---

## 📋 증상 체크리스트

| 증상 | 해당 여부 |
|------|----------|
| 구글 로그인은 정상 작동 | ✅ |
| 카카오 동의 화면까지는 정상 도달 | ✅ |
| "확인하고 계속하기" 클릭 후 로그인 화면으로 돌아감 | ✅ |
| 에러 메시지 없이 조용히 실패 | ✅ |
| 프론트엔드 코드를 여러 번 수정해도 동일 현상 | ✅ |

> **위 체크리스트에 모두 해당하면 → HashRouter + OAuth 리다이렉트 경로 불일치 문제입니다.**

---

## 🔍 근본 원인 분석

### 핵심: HashRouter vs BrowserRouter

이 프로젝트는 `HashRouter`를 사용합니다 (`src/main.jsx`).

```
HashRouter의 URL 구조:   https://hanguk.netlify.app/#/login
BrowserRouter의 URL 구조: https://hanguk.netlify.app/login
```

### OAuth 플로우에서 발생하는 문제

```
1. 사용자가 "카카오로 로그인" 클릭
   → kauth.kakao.com 으로 리다이렉트 (redirect_uri 포함)

2. 카카오 동의 후 리다이렉트
   → https://hanguk.netlify.app/auth/kakao/callback?code=abc123
   ※ 카카오는 # 없는 실제 URL 경로로 리다이렉트함

3. HashRouter가 URL을 해석
   → pathname: /auth/kakao/callback ← HashRouter가 인식 못함!
   → hash: (없음)
   → HashRouter는 기본 경로(/)로 처리

4. PrivateRoute가 / 경로를 보호
   → currentUser 없음 → /login 으로 리다이렉트

결과: 카카오 콜백 컴포넌트가 마운트조차 되지 않음
```

### 왜 구글 로그인은 되는가?

구글 로그인은 `signInWithPopup()`을 사용합니다.  
팝업 방식은 **URL 리다이렉트가 없으므로** HashRouter와 충돌하지 않습니다.

카카오 로그인은 `Authorization Code Flow` (URL 리다이렉트 방식)를 사용하므로 충돌이 발생합니다.

---

## ✅ 해결 방법

### `src/main.jsx` — 앱 마운트 전 경로 변환

```javascript
// ── 카카오 OAuth 콜백 → HashRouter 경로 변환 ──────────────────────────
// 카카오가 /auth/kakao/callback?code=xxx 로 리다이렉트하면
// HashRouter 가 이 경로를 인식하지 못한다 (# 이 없으므로).
// 앱 마운트 전에 URL 을 /#/auth/kakao/callback?code=xxx 로 변환한다.
if (
    window.location.pathname === '/auth/kakao/callback' &&
    !window.location.hash
) {
    const search = window.location.search; // ?code=xxx&...
    window.location.replace(
        window.location.origin + '/#/auth/kakao/callback' + search
    );
    // replace 후 페이지가 리로드되므로 아래 코드는 실행되지 않음
}
```

**동작 원리:**
1. 카카오가 `/auth/kakao/callback?code=xxx`로 리다이렉트
2. Netlify SPA fallback이 `index.html` 반환
3. `main.jsx`의 최상단 코드가 pathname 감지
4. `window.location.replace()`로 `/#/auth/kakao/callback?code=xxx`로 변환
5. 페이지 리로드 → HashRouter가 정상적으로 경로 인식
6. `KakaoCallback` 컴포넌트 마운트 → `useSearchParams`로 code 추출 → 로그인 완료

---

## 🏗️ 전체 카카오 로그인 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│  프론트엔드 (React + HashRouter)                                  │
│                                                                 │
│  src/Components/Login.jsx                                       │
│    └─ handleKakao() → loginWithKakao()                          │
│                                                                 │
│  src/lib/kakao.js                                               │
│    ├─ loginWithKakao()  → kauth.kakao.com 으로 리다이렉트         │
│    └─ completeKakaoLogin(code)  → Netlify 함수 POST → Firebase   │
│                                                                 │
│  src/main.jsx                                                   │
│    └─ ⭐ /auth/kakao/callback → /#/auth/kakao/callback 변환      │
│                                                                 │
│  src/Components/auth/KakaoCallback.jsx                          │
│    └─ code 추출 → completeKakaoLogin → 자동 홈 이동               │
│                                                                 │
│  src/App.jsx                                                    │
│    └─ <Route path="/auth/kakao/callback" element={...} />       │
└─────────────────────────────────────────────────────────────────┘
         │                    ▲
         ▼                    │ customToken
┌─────────────────────────────────────────────────────────────────┐
│  서버리스 함수 (Netlify Functions)                                 │
│                                                                 │
│  netlify/functions/kakao-login.js                               │
│    1. code → access_token 교환 (kauth.kakao.com)                 │
│    2. access_token → 사용자 정보 (kapi.kakao.com)                 │
│    3. Firebase Auth 사용자 생성/갱신                               │
│    4. createCustomToken 발행 → 프론트엔드에 반환                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ 필수 설정 체크리스트

### 1. Kakao Developers (https://developers.kakao.com)

- [ ] 앱 생성 완료
- [ ] **카카오 로그인 활성화** (ON)
- [ ] **Redirect URI 등록**: `https://hanguk.netlify.app/auth/kakao/callback`
- [ ] 동의항목 설정: 닉네임, 프로필 사진, 이메일
- [ ] 클라이언트 시크릿 활성화 시 → Netlify 환경변수에 `KAKAO_CLIENT_SECRET` 등록

### 2. Netlify 환경변수 (Site → Settings → Environment variables)

| 변수명 | 값 | 확인 |
|--------|-----|------|
| `KAKAO_REST_API_KEY` | Kakao REST API 키 | ☐ |
| `KAKAO_CLIENT_SECRET` | 클라이언트 시크릿 (활성화 시) | ☐ |
| `FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID | ☐ |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK 이메일 | ☐ |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK 비공개 키 | ☐ |

> ⚠️ **중요:** 로컬 `.env` 파일의 변수는 **로컬 개발 서버에서만** 작동합니다.  
> 배포된 Netlify Functions가 사용하려면 **반드시 Netlify 대시보드에 별도 등록**해야 합니다.

### 3. Firebase Console

- [ ] Authentication → Sign-in method → **커스텀 토큰** 사용 가능 상태
- [ ] Admin SDK 서비스 계정 키 발급 완료

### 4. 진단 엔드포인트

환경변수 설정 여부를 즉시 확인할 수 있습니다:

```
GET https://hanguk.netlify.app/.netlify/functions/kakao-login?diag=1
```

정상 응답:
```json
{
  "diag": true,
  "env": {
    "KAKAO_REST_API_KEY": true,
    "KAKAO_CLIENT_SECRET": true,
    "FIREBASE_PROJECT_ID": true,
    "FIREBASE_CLIENT_EMAIL": true,
    "FIREBASE_PRIVATE_KEY": true,
    "privateKeyLooksValid": true
  },
  "adminInitialized": true
}
```

---

## 🚨 다른 OAuth 제공자 추가 시 주의사항

**HashRouter를 사용하는 한, 모든 OAuth 리다이렉트 방식 로그인에 동일한 문제가 발생합니다.**

새로운 OAuth 제공자(네이버, Apple 등)를 추가할 때는 반드시 `src/main.jsx`에 해당 콜백 경로도 변환 코드를 추가하세요:

```javascript
// 예: 네이버 로그인 추가 시
const OAUTH_CALLBACK_PATHS = [
    '/auth/kakao/callback',
    '/auth/naver/callback',  // 추가
];

if (
    OAUTH_CALLBACK_PATHS.includes(window.location.pathname) &&
    !window.location.hash
) {
    const search = window.location.search;
    window.location.replace(
        window.location.origin + '/#' + window.location.pathname + search
    );
}
```

### 근본적 대안: BrowserRouter 전환

`HashRouter` → `BrowserRouter`로 전환하면 이 문제가 근본적으로 해결됩니다.  
단, Netlify의 SPA fallback (`/* → /index.html`)이 이미 설정되어 있으므로 전환은 간단합니다.  
기존 `/#/` URL을 사용하는 북마크나 공유 링크가 깨질 수 있으므로 주의하세요.

---

## 📝 디버깅 순서 (향후 같은 문제 발생 시)

```
1. 진단 엔드포인트 호출
   → 환경변수 설정 여부 확인
   → 하나라도 false면 Netlify 환경변수 설정

2. 브라우저 콘솔 확인
   → [Kakao] 로그가 없으면 → 콜백 컴포넌트 마운트 안 됨
   → main.jsx의 경로 변환 코드 확인

3. 네트워크 탭 확인
   → /.netlify/functions/kakao-login POST 요청 존재?
   → 응답 상태코드와 body 확인

4. 카카오 Redirect URI 확인
   → Kakao Developers 콘솔에서 등록된 URI와 실제 URI 비교
```

---

*이 문서는 2026-07-07 카카오 로그인 10회 이상 수정 실패 후 근본 원인을 발견하여 작성되었습니다.*
