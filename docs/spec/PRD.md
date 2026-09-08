# PRD — PromiseU (Meet4U) 재현 명세서

> **문서 목적**: 이 문서 하나만 읽고도 동일한 제품을 처음부터 만들 수 있도록 하는 제품 요구사항 정의서.
> 기술 상세는 `TRD.md`, 데이터 모델은 `ERD.md`, AI 코딩 에이전트용 지시문은 `PROMPT.md` 참조.

- **문서 버전**: 1.0
- **작성일**: 2026-09-08
- **기준 배포**: https://hanguk.netlify.app

---

## 1. 제품 개요

### 1.1 한 줄 정의
**프로젝트(동호회) 단위로 약속을 잡고, 참석을 관리하고, 비용을 1/N 정산하고, 다국어 실시간 채팅까지 지원하는 모바일 우선 PWA.**

### 1.2 해결하는 문제

| 기존 방식의 문제 | 이 제품의 해결 |
|---|---|
| 카카오톡 오픈채팅 "일정관리 + 댓글"로 참석 집계 → 누가 오는지 스크롤해야 앎 | 참석/불참 버튼 + 실시간 집계 카드 |
| 코트비 정산을 총무가 수기 계산 | 참석자 수 기준 자동 1/N + 입금 체크리스트 |
| 게스트 모집 마감 여부가 안 보임 | 정원 도달 시 자동 마감 + 대기열 자동 승격 |
| 외국인 멤버와 언어 장벽 | 메시지 자동 번역 + 발음 표기 + 실시간 음성 통역 |
| 여러 동호회를 하나의 방에서 관리 | 프로젝트 단위 분리 (멤버·일정·정산 모두 격리) |

### 1.3 타깃 사용자
- **1차**: 고양·파주·김포 지역 테니스 동호회 (20~50명 규모)
- **2차**: 정기 모임을 갖는 모든 소모임 (풋살, 스터디, 등산 등)
- **환경**: 안드로이드/iOS 모바일 브라우저 및 홈화면 설치 PWA가 1순위. 데스크톱은 관리 용도.

---

## 2. 핵심 도메인 개념

```
사용자(User)
  └─ 여러 프로젝트(Project)에 소속 가능
       └─ 프로젝트 안에 미팅(Meeting) 생성
            ├─ 참석 응답(attend/decline)
            ├─ 대여 비용 + 예약자 지정
            ├─ 댓글 스레드
            └─ 스코어보드(경기 기록)
       └─ 프로젝트 멤버로만 대화방(ChatRoom) 초대 가능
게스트 모집(GuestMeetup) — 프로젝트와 독립된 공개 모집 도메인
  ├─ 정원(cap) 도달 시 자동 마감
  ├─ 대기열(wait) 자동 승격
  └─ 1인당 금액 직접 지정
```

**가장 중요한 규칙 3가지**
1. **프로젝트에 속하지 않으면 아무것도 볼 수 없다.** 캘린더/대화방/미팅 생성 모두 프로젝트 멤버십이 전제.
2. **회원 등급(4단계)에 따라 메뉴 접근이 달라진다.** 접근 불가 메뉴도 화면에는 보이되 회색·잠금 처리.
3. **동시성이 중요한 조작은 트랜잭션으로 처리한다.** 게스트 모집 참가/취소/대기 승격은 정원 초과가 절대 발생하면 안 됨.

---

## 3. 회원 등급 체계

| 코드 | 한글 표기 | 뱃지 | 뱃지 색 | 설명 |
|---|---|---|---|---|
| `general` | 일반회원 | (없음) | 회색 | 가입 직후 기본값 |
| `full` | 정회원 | `정` | 파랑 | 정기 활동 회원 |
| `special` | 특별회원 | `특` | 보라 | 운영진 |
| `admin` | 관리자 | `관` | 앰버 | 전체 관리 권한 |

### 3.1 등급 판정 로직
```
if (userProfile.group && ['general','full','special','admin'].includes(userProfile.group))
    → userProfile.group
else if (userProfile.role === 'admin')
    → 'admin'
else
    → 'general'
```
※ `role === 'admin'` 은 레거시 호환. 신규는 `group` 필드 사용.

### 3.2 메뉴 접근 제어
- `config/menuPermissions` 문서에 `{ menuKey: { general: bool, full: bool, special: bool, admin: bool } }` 저장
- 관리자 페이지의 "권한 관리" 탭에서 체크박스로 편집
- 사이드바는 **모든 메뉴를 항상 렌더**하되, 접근 불가 시:
  - 텍스트 opacity 25% 회색
  - `<Link>` 대신 `<div>` 로 렌더 (클릭 불가)
  - 최소 요구 등급 뱃지(정/특/관)를 회색 톤으로 표시

### 3.3 로그인 직후 첫 화면 (등급별 분기)
| 등급 | 진입 경로 |
|---|---|
| 정회원 / 특별회원 / 관리자 | `/calendar` (월간 모임) + **모아보기 리스트 뷰 자동 적용** |
| 일반회원 | `/guest-meetups` (게스트 모집) |

구현: `localStorage.meet4u_calendar_view = 'list'` 를 리다이렉트 직전에 세팅.

---

## 4. 기능 명세

### 4.1 인증

**F-AUTH-01 · 구글 로그인**
- Firebase Auth `signInWithPopup(GoogleAuthProvider)`
- 최초 로그인 시 `users/{uid}` 문서 자동 생성 (`role:'user'`, `preferredLanguage:'ko'`)

**F-AUTH-02 · 카카오 로그인**
- 카카오 OAuth 2.0 Authorization Code Flow
- 리다이렉트 → Netlify Function `kakao-login` → 카카오 토큰 교환 → Firebase Custom Token 발급 → `signInWithCustomToken`
- 카카오 계정은 `email` 이 `null` 일 수 있음 → `{uid}@kakao.local` 로 대체

**F-AUTH-03 · 관리자 세션**
- ID + SHA-256 해시 비교 방식의 별도 관리자 로그인 (환경변수 `VITE_ADMIN_ID`, `VITE_ADMIN_PASSWORD_HASH`)
- 성공 시 `sessionStorage.meet4u_admin = 'true'` (탭 단위 유지)
- Firestore `users/{uid}.role === 'admin'` 인 경우에도 자동으로 관리자 권한 부여

**F-AUTH-04 · 프로필 실시간 구독 (중요)**
- `users/{uid}` 를 `getDoc` 이 아닌 **`onSnapshot`** 으로 구독
- 이유: 로그인 직후 auth 토큰이 Firestore 백엔드로 전파되기 전 `permission-denied` 가 발생할 수 있는데, 일회성 read 면 프로필이 `null` 로 굳어 등급 판정이 실패함 → 관리자인데 메뉴가 회색으로 보이는 버그 발생
- `onSnapshot` 은 자동 재시도 + role 변경 시 즉시 반영

---

### 4.2 프로젝트

**F-PROJ-01 · 프로젝트 목록**
- `projects` 컬렉션에서 `memberEmails array-contains 내이메일` 로 구독
- 사이드바 상단에 chip 형태로 표시, 클릭 시 `currentProjectId` 전환 (localStorage 영속)

**F-PROJ-02 · 프로젝트 생성/초대/제거**
- 이름, 아이콘(이모지), 색상 지정
- 회원 검색 후 다중 초대 (`memberEmails` 배열에 추가)
- 멤버 제거는 생성자 또는 관리자만

**F-PROJ-03 · 컨텍스트 fallback (중요)**
```js
// 내가 멤버가 아닌 프로젝트가 currentProjectId 로 남아 있으면 안 됨
useEffect(() => {
    if (loading) return;               // ← projects.length === 0 조건을 넣으면 안 됨!
    const found = projects.find(p => p.id === currentProjectId);
    if (!found) setCurrentProjectId(projects[0]?.id || null);
}, [projects, currentProjectId, loading]);
```
- `projects.length === 0` 일 때 early-return 하면 신규 가입자가 localStorage 기본값(`tennis-default`)을 유지해 **남의 프로젝트 일정을 전부 보게 되는 보안 사고** 발생

---

### 4.3 캘린더 / 미팅

**F-CAL-01 · 주간 모임** (`/weekly`)
- 이번 주 중 일정이 있는 날짜만 카드로 표시
- 배경 이미지 오버레이 (opacity 50%) + CelestialLoom 장식 애니메이션

**F-CAL-02 · 월간 모임** (`/calendar`)
- 두 가지 뷰 모드 (localStorage `meet4u_calendar_view` 로 영속)
  - `grid`: 전통적 월 캘린더 그리드
  - `list` (**모아보기**): 약속 있는 날짜만 모아 리스트로
- 우상단 "+ 미팅 생성" 버튼 — 프로젝트 없으면 회색 처리 + `/projects` 로 유도

**F-CAL-03 · 프로젝트 스코프 보안 게이트 (중요)**
```js
const myProjectIds = new Set(projects.map(p => p.id));
meetings
  .filter(m => myProjectIds.has(m.projectId || DEFAULT_PROJECT_ID))  // 1차: 멤버십
  .filter(m => (m.projectId || DEFAULT_PROJECT_ID) === currentProjectId)  // 2차: 현재 선택
```
- `currentProjectId` 만 믿으면 stale 값으로 남의 일정이 노출됨

**F-CAL-04 · 미팅 생성/편집** (`/schedule`)
- 필드: 제목, 날짜, 시작/종료 시간, 장소, 대여 비용(다중 항목), 설명
- **대여 비용**: `{ cost, bookedBy }` 배열. 예약자 드롭다운은 **현재 프로젝트 멤버만** 검색 가능
- 프로젝트 미소속 시 폼 대신 "먼저 프로젝트가 필요해요" 안내 카드

**F-CAL-05 · 미팅 상세 모달**
- 참석/불참 버튼 + 저장 (저장 시 팝업 자동 닫힘)
- 실시간 참석 현황 (참석/불참/미응답 카운트)
- 헤더 우측 **관리자 원형 버튼**(🛡, 관리자만) → 회원별 참석 상태 강제 지정
- **게스트 초대** 버튼 → 이 미팅 정보를 seed 로 게스트 모집 폼 오픈
  - 초대가 마감되면 버튼이 인디고 필드로 반전되며 `초대 N명 완료` 표시
- 댓글 스레드 + 스코어보드

---

### 4.4 게스트 모집 (`/guest-meetups`)

프로젝트와 독립된 **공개 모집** 도메인. 테니스 게스트 모집 UX를 그대로 재현.

**F-GUEST-01 · 목록 화면**
- 상단 탭 4종: `전체보기`(기본) / `모집중` / `내 참가` / `내 대기`
- 필터 chip (AND 조합):
  - **장소** — 프리셋 없음. 등록된 모임의 `place` 에서 코트 번호를 잘라낸 prefix 를 동적 수집
    - `충장 1번`, `충장 2번` → chip `충장`
    - `파주 운정A` → chip `파주 운정`
  - **실력(NTRP)** — 2.0 / 2.5 / 3.0 / 3.5
  - **경기** — 여단 / 남단 / 혼복 / 남복 / 여복
- 정렬 4종: 날짜 빠른순 / 장소순 / 잔여석 많은순 / 실력순
- 날짜별 그룹 헤더 (`8월 8일 (토)` · 토=파랑, 일=빨강)
- 관리자에게만 chip 옆 ✏️(일괄 rename) / 🗑(일괄 삭제) 노출

**F-GUEST-02 · 카드 표시**
- 시간 / NTRP·경기 뱃지 / 마감 or 남은자리 뱃지
- 진행 바 = `게스트수 / 모집인원`
- **카운트는 호스트 제외**: `cap=3, 게스트 2명` → `2/3명`

**F-GUEST-03 · 참가 로직 (트랜잭션 필수)**
```
runTransaction:
  1. 최신 문서 read
  2. 이미 roster/wait 에 있으면 no-op
  3. roster.length >= cap+1 이거나 closed → wait 배열에 추가
  4. 아니면 roster 에 추가 후 closed = (roster.length >= cap+1) 재계산
  5. write
```

**F-GUEST-04 · 취소 + 대기 자동 승격 (트랜잭션 필수)**
```
runTransaction:
  1. 최신 문서 read
  2. 호스트는 취소 불가 (에러)
  3. roster 에서 본인 제거
  4. 자리 났고 wait.length > 0 이면 wait[0] 을 roster 로 승격
     · promotedFromWait: true, promotedAt: timestamp 마킹
  5. closed 재계산 후 write
```
- 승격된 참가자는 상세 화면에서 `🎉 대기승격` 초록 뱃지로 표시

**F-GUEST-05 · 정산**
- 호스트가 **1인당 금액을 직접 입력** (코트비/공/기타 세분류는 폐기)
- 참가자별 입금완료 체크박스 + `입금완료 2/4명` 집계
- 입금 계좌: 은행 선택(카카오뱅크 / **카톡입금** / 국민 / 신한 / 우리 / 하나 / 농협 / 기업 / 새마을금고 / 토스뱅크) + 계좌번호 + 예금주 + 계좌 복사 버튼
- 계좌번호·예금주·장소는 매번 새로 입력하도록 localStorage 기본값에 저장하지 않음 (placeholder 노출)

**F-GUEST-06 · 마감메세지**
- 생성 폼에 "🎉 마감메세지 (선택)" 텍스트 영역
- placeholder: `예: 모임인원이 확정되었습니다. "코트는 2번입니다."`
- 정원이 다 차는 순간 **참가자 전원(발신자 제외)** 에게 이 문구가 푸시로 발송

**F-GUEST-07 · 카톡 공유 (딥링크)**
- 상세 모달 헤더의 `📋 톡에 공유` 버튼
- 클립보드에 복사되는 텍스트:
```
🎾 [8/8(토)] 게스트 모집
📍 충장 1번
⏰ 06:00 ~ 08:00
🎯 NTRP 3.0 · 혼복
👥 남은 2자리 · 2/4명
💰 1인 13,000원
🏦 카카오뱅크 3333-01-1234567 (허우진)
📝 코트는 2번입니다.

👉 참가하기: https://<도메인>/#/guest-meetups?open=<id>
```
- 상대가 링크를 열면 그 모임 상세가 자동으로 열림
- 로그인 리다이렉트로 쿼리가 유실되는 경우 대비: 앱 마운트 전에 `window.location.hash` 를 파싱해 `sessionStorage` 에 stash

---

### 4.5 챗.첵 (CHAT.CHECK) — `/chat-check`

**F-CHAT-01 · 대화방**
- `globalChatRooms` 컬렉션. 초대받은 멤버만 read 가능 (Firestore 규칙으로 강제)
- 방 선택 드롭다운 + 참여자 보기 + 새 대화방 버튼

**F-CHAT-02 · 대화방 생성 시 초대 대상 제한 (중요)**
- **내가 참여 중인 프로젝트의 멤버만** 검색 가능
- 프로젝트 0개 → 모달 대신 "먼저 프로젝트가 필요해요" 안내 + `/projects` 이동 버튼
- 프로젝트 2개 이상 → 상단에 프로젝트 필터 chip (전체 / 개별) 노출, 검색 결과에 소속 프로젝트명 태그 표시

**F-CHAT-03 · 다국어 메시지**
- 보낸 사람의 `preferredLanguage` 를 `sourceLanguage` 로 저장
- 받는 사람의 언어로 자동 번역 (Google Translate gtx 엔드포인트, Netlify Function 프록시)
- 번역문 아래 **발음 표기**(한글 음차) 자동 생성 — 로마자/병음/가나 → 한글 변환
- 지원 언어 20종: ko, en, zh-CN, ja, ru, es, vi, mn, ar, fr, km, bn, uz, si, my, tl, th, id, ne

**F-CHAT-04 · 메시지 액션 (말풍선 옆 세로 버튼)**
- 🔊 원문 소리내어 듣기 (Google Translate TTS 프록시)
  - **200자 제한 대응**: 문장 경계(`. ! ? 。！？…`)로 나누고 순차 재생. 하나의 컨트롤러 객체가 `.play()/.pause()/onended/onerror` 를 노출해 기존 호출부와 호환
- 📋 복사
- 📖 문법 분석 → Gemini 정밀 분석 팝업

**F-CHAT-05 · 상단 도구 바**
| 버튼 | 기능 |
|---|---|
| 👥 참여자 | 방 멤버 목록 |
| 🔇 자동 음성 | 새 메시지 자동 TTS 토글 |
| 💬 내가 직접 말하기 | 메모/발음 연습 모드 |
| 📡 라이브 통역 | Gemini Live API(WebSocket) 실시간 음성 통역 |
| 📄 회의록 만들기 | 기간 선택 → Gemini 로 마크다운 회의록 생성 |
| ➕ 새 대화방 | 프로젝트 멤버 초대 |

**F-CHAT-06 · 회의록 생성**
- 기간 프리셋: 오늘 / 어제 / 최근 3일 / 7일 / 30일 / 사용자 지정
- 출력 언어 = 내 설정 언어
- 프롬프트 수정 가능 + localStorage 저장
- 결과: 복사 + `.md` 다운로드

---

### 4.6 저 여기있어요 (`/global-meeting`)

**F-MAP-01 · 지도**
- Leaflet + OpenStreetMap 타일 + 마커 클러스터
- 등록된 핀 표시. zoom ≥ 10 이면 핀 아래 **제목 앞 2글자** 라벨(pill) 노출
  - `삼송테니스장(인조잔디)` → `삼송`

**F-MAP-02 · 핀 검색**
- 외부 지도 API가 아닌 **등록된 핀만** 실시간 필터 (title/address/등록자 부분 매칭)
- 결과 클릭 → zoom 17로 확대 이동 + 해당 핀 팝업 자동 오픈
  - 구현 주의: `<MarkerClusterGroup>` 자식 `<Marker>` 에 callback ref 를 달면
    react-leaflet 5.x + react-leaflet-cluster 4.x 조합에서 `TypeError: VM is not a constructor` 크래시 발생.
    반드시 `useMap()` + `map.eachLayer()` 좌표 매칭 방식으로 우회할 것.

**F-MAP-03 · 핀 추가 (관리자 전용)**
- 주소 입력 폼, 지도 클릭, 검색 결과 클릭 → 모두 관리자만 가능
- 일반 사용자에게는 안내 문구 카드로 대체

**F-MAP-04 · 내 위치 공유 (프로젝트 단위)**
- `[내 위치 공유]` 클릭 → **프로젝트 선택 모달** 오픈 (다중 선택 가능)
- 선택한 프로젝트 id 배열을 `liveLocations/{uid}.audienceProjectIds` 에 저장
- 구독 필터: 상대의 `audienceProjectIds` 중 하나라도 내가 멤버여야 지도에 표시 (내 자신은 항상 표시)
- 프로젝트 0개면 공유 불가 안내

---

### 4.7 내 대시보드 (`/my-dashboard`)

**F-DASH-01 · 참석 현황**: 이달 / 올해 / 전체 참석 카드
**F-DASH-02 · 게스트 참석 현황**: 남의 게스트 모집에 게스트로 참여한 횟수 (이달/올해/전체)
**F-DASH-03 · 비용 현황**: 월 이동 가능, 내가 낼 금액 / 예약한 금액 / 정산 차액
**F-DASH-04 · 경기 통계**: 참여 경기 / 승 / 무 / 패 + 승률 도넛 차트
**F-DASH-05 · 프로젝트별 통계**
- 프로젝트 카드마다: 아이콘, 이름, `참석 N회 · 경기 M회`, 승률(무승부 제외), W/D/L 스택 바
**F-DASH-06 · 프로젝트별 상세 통계** (관리자 페이지에서 이관)
- 프로젝트 필터 chip (전체 / 개별)
- **월별 참석 통계**: 일정별 참석자 목록 테이블 + 회원별 참석 횟수 막대 차트 + 참석률
- **월별 비용 관리**: 미팅별 비용 테이블 + 회원별 정산 테이블(낼 금액 / 예약 금액 / 차액)
- 필터 시 legacy 미팅(`projectId` 없음)은 `DEFAULT_PROJECT_ID` 로 간주

---

### 4.8 설정 (`/settings`)

**F-SET-01 · 앱 제목 변경** — 사이드바/브라우저 탭 제목 커스터마이즈
**F-SET-02 · Gemini API 키**
- Firestore `users/{uid}.geminiApiKey` 에 저장 → 모든 기기 자동 동기화
- 우선순위: 클라우드 → localStorage(마이그레이션 전 호환) → 관리자 공유 키(env)
- 상태 뱃지: `계정 저장됨(모든 기기 동기화)` / `이 기기에만 저장` / `관리자 공유 키 사용 중` / `미설정`
- 형식 검증: `AIza` 30자 이상 또는 `AQ.` 20자 이상
**F-SET-03 · 테마** — 기본 / 갤럭시(우주 배경 + 별 애니메이션) / 페이퍼
**F-SET-04 · 푸시 알림 설정** — 권한 요청 + FCM 토큰 등록
**F-SET-05 · 구글 캘린더 연동** — 미팅을 구글 캘린더에 동기화

**F-SET-06 · 프로필 · 언어 설정 (요청 항목)**

프로필 편집 영역에 닉네임 입력과 **언어 선택 드롭다운**을 함께 배치한다.

```
┌─────────────────────────────────────┐
│ [닉네임을 입력하세요        ]        │
│ 🌐 [🇰🇷 한국어(Korean)      ▾]      │
│ [💾 저장]  [✕]                      │
└─────────────────────────────────────┘
```

- 드롭다운 옵션 (20종, 순서 고정):

| code | label |
|---|---|
| `ko` | 🇰🇷 한국어(Korean) |
| `en` | 🇺🇸 English(영어) |
| `zh-CN` | 🇨🇳 中文(Chinese) |
| `ja` | 🇯🇵 日本語(Japanese) |
| `ru` | 🇷🇺 Русский(Russian) |
| `es` | 🇪🇸 Español(Spanish) |
| `vi` | 🇻🇳 Tiếng Việt(Vietnamese) |
| `mn` | 🇲🇳 Монгол(Mongolian) |
| `ar` | 🇸🇦 العربية(Arabic) |
| `fr` | 🇫🇷 Français(French) |
| `km` | 🇰🇭 ភាសាខ្មែរ(Cambodian) |
| `bn` | 🇧🇩 বাংলা(Bengali / 방글라데시) |
| `uz` | 🇺🇿 Oʻzbek(Uzbek / 우즈베키스탄) |
| `si` | 🇱🇰 සිංහල(Sinhala / 스리랑카) |
| `my` | 🇲🇲 မြန်မာ(Burmese / 미얀마) |
| `tl` | 🇵🇭 Filipino(Tagalog / 필리핀) |
| `th` | 🇹🇭 ไทย(Thai / 태국) |
| `id` | 🇮🇩 Bahasa Indonesia(인도네시아) |
| `ne` | 🇳🇵 नेपाली(Nepali / 네팔) |

- 저장 시 `users/{uid}.preferredLanguage` 갱신
- 이 값이 채팅 번역의 **타깃 언어**로 사용됨
- 별도로 사이드바/헤더의 `LanguageSwitcher` 는 **UI 자체의 언어**(i18next, ko/en/zh 3종)를 전환 — 두 개는 다른 개념이므로 분리해서 구현할 것

---

### 4.9 관리자 (`/admin`)

탭 3종 (월별 통계·비용은 대시보드로 이관됨):

**F-ADM-01 · 회원 관리**
- 회원 목록, 등급(group) 변경, 관리자 지정/해제, 회원 삭제

**F-ADM-02 · 전체 미팅**
- 숨김 포함 모든 미팅 표시
- 각 카드에 **프로젝트 뱃지**(아이콘 + 이름, 프로젝트 색상 반영)
  - `projectId` 있는데 프로젝트 삭제됨 → 회색 "프로젝트 없음"
  - `projectId` 자체가 없음 → "미분류"
- 액션 3종: 숨기기/보이기 · 수정(폼으로 이동) · 삭제(확인 후)

**F-ADM-03 · 권한 관리**
- 메뉴 × 등급 매트릭스 체크박스
- `config/menuPermissions` 에 저장

---

### 4.10 알림 (푸시)

**F-NOTI-01 · 4대 알림**

| # | 이벤트 | 수신자 | 태그 |
|---|---|---|---|
| 1 | 대화방 새 메시지 | 방 멤버 전원(발신자 제외) | `chat-{roomId}` |
| 2 | 미팅 참석 상태 변경 | 참석자 + 참석 예정자 | `attend-{meetingId}` |
| 3 | 게스트 모집에 참가 발생 | 호스트 | `gjoin-{meetupId}` |
| 4 | 게스트 모집 마감 | 참가자 전원 | `gfull-{meetupId}` |

(부가) 대기 → 참가 승격: `gpromo-{meetupId}-{uid}`

**F-NOTI-02 · 중복 방지 3중 방어선 (중요)**

이전 알림이 계속 쌓이는 문제를 막기 위해:

1. **서버 Topic 헤더** — FCM `webpush.headers.Topic` 에 sanitize한 태그(URL-safe base64, 32자) 전달. 오프라인 상태에서 같은 Topic 이 여러 개 큐에 쌓이면 최신 것만 배달
2. **SW 안정 태그** — `Date.now()` 사용 금지. 서버가 보낸 `data.tag` 를 그대로 알림 태그로 사용 → 같은 tag 는 브라우저가 자동 교체
3. **명시적 정리** — SW 에 `CLEAR_NOTIF` postMessage 리스너. 채팅방을 열면 그 방의 남은 알림을 `getNotifications({tag}).forEach(n => n.close())` 로 제거

**F-NOTI-03 · 발송 흐름**
```
클라이언트(액션 수행자)
  → POST /.netlify/functions/send-notification
      { type, title, body, url, tag, recipientUids|recipientEmails, senderUid|senderEmail }
  → Firebase Admin SDK 로 users 문서 조회 → fcmTokens 수집
  → messaging().sendEach()
  → 각 기기 SW onBackgroundMessage → showNotification
  → 알림 클릭 → data.url 로 라우팅
```
- 유효하지 않은 토큰은 응답 코드로 판별해 Firestore 에서 자동 제거

---

## 5. 화면 구조

### 5.1 라우트 맵

| 경로 | 화면 | 메뉴 키 |
|---|---|---|
| `/login` | 로그인 | — |
| `/auth/kakao/callback` | 카카오 콜백 | — |
| `/` | 등급별 리다이렉트 | — |
| `/menu` | 모바일 카드 홈 | — |
| `/weekly` | 주간 모임 | `weeklyCalendar` |
| `/calendar` | 월간 모임 | `monthlyCalendar` |
| `/schedule` | 모임 만들기 | `createMeeting` |
| `/guest-meetups` | 게스트 모집 | `guestMeetups` |
| `/global-meeting` | 저 여기있어요 | `globalMeeting` |
| `/chat-check` | 챗.첵 | `chatCheck` |
| `/my-dashboard` | My 대시보드 | `myDashboard` |
| `/settings` | 설정 | `settings` |
| `/admin` | 관리자 | `admin` |
| `/projects` | 프로젝트 관리 | — |
| `/profile` | 프로필 | — |

### 5.2 데스크톱 사이드바
```
┌──────────────────┐
│ 📅 PromiseU   ⏴  │  ← 접기 토글
│        [🌐 한국어]│
│ 📁 프로젝트       │
│  [🎾 테니스운동예약 ✓]│
│  [📁+ 프로젝트 관리] │
├──────────────────┤
│ 🏠 주간 모임      │
│ 📅 월간 모임      │
│ ➕ 모임 만들기    │
│ 🏆 게스트 모집    │
│ 🌐 저 여기있어요  │
│ 💬 챗.첵      [정]│
│ 📊 My 대시보드    │
│ ─────────────    │
│ ⚙️ 설정           │
│ 🛡 관리자     [관]│  ← 권한 없으면 회색
├──────────────────┤
│ 👤 허우진 [정회원]│
│    user@mail.com │
│ [로그아웃]  [✉]  │
└──────────────────┘
```

### 5.3 모바일 카드 홈 (`/menu`)
```
어느 모임에 활동해 볼까요? 👋
큰 버튼을 눌러 원하는 화면을 여세요

┌────────────────────────────┐
│ 🏠  주간 모임        [정] →│
│     이번 주 약속 한눈에    │
└────────────────────────────┘
┌────────────────────────────┐
│ 📅  월간 모임        [정] →│
│     월별 캘린더 보기       │
└────────────────────────────┘
...
─── 시스템 ───
┌────────────────────────────┐
│ 🛡  관리자           [관] →│
│     권한이 없어요 · 잠금   │  ← 회색, 클릭 불가
└────────────────────────────┘
```

**카드 컬러 매핑**

| 메뉴 | 아이콘 배경 | 서브카피 |
|---|---|---|
| 주간 모임 | `bg-indigo-500` | 이번 주 약속 한눈에 |
| 월간 모임 | `bg-cyan-500` | 월별 캘린더 보기 |
| 모임 만들기 | `bg-orange-500` | 새 약속 등록하기 |
| 게스트 모집 | `bg-lime-500` | 테니스 게스트 모집 |
| 저 여기있어요 | `bg-sky-500` | 실시간 위치 공유 |
| 챗.첵 | `bg-purple-500` | 그룹 대화방 |
| My 대시보드 | `bg-rose-500` | 내 활동 통계 |
| 설정 | `bg-slate-500` | 앱 설정 관리 |
| 관리자 | `bg-amber-500` | 회원 · 미팅 관리 |

### 5.4 모바일 헤더
```
[▦]  📅 PromiseU        [🌐 한국어] [⎋] [🔔]
 ↑                                    ↑
 /menu 복귀                        로그아웃(원형·붉은톤)
```
- 햄버거(☰) 없음 — `/menu` 카드 홈과 기능이 중복이므로 제거

---

## 6. 디자인 시스템

### 6.1 메인 앱 팔레트 (Tailwind 기본 + 블루 계열)
- 사이드바: `bg-gradient-to-b from-blue-50 via-indigo-50 to-sky-100`
- 주 색상: `blue-600` (액션), `indigo-600` (보조)
- 카드: `bg-white` + `border-gray-100` + `shadow-sm` + `rounded-xl`

### 6.2 게스트 모집 전용 팔레트 (따뜻한 크림 톤)
```css
--bg:     #f2ecdd
--card:   #fbf8f0
--line:   #e5dbc4
--ink:    #2b2721
--sub:    #8b8069
--accent: #e0a13c
--dark:   #171a33
--green:  #2f8f5b
--red:    #c0492b
```
- 카드 라운드 16px, 컨테이너 max-width 560px 중앙 정렬
- 상세/생성은 바텀시트 모달 (`border-radius: 20px 20px 0 0`)

### 6.3 폰트
- Paperlogy (한글 가변형, jsDelivr CDN woff2, `font-display: swap`)
- fallback: system-ui, -apple-system, Noto Sans KR, Apple SD Gothic Neo

### 6.4 테마 3종
| 이름 | 설명 |
|---|---|
| 기본 | 밝은 블루 톤 |
| 갤럭시 | 다크 우주 배경 + 별 twinkle/drift 애니메이션 |
| 페이퍼 | 종이 질감 크림 톤 |

`html` 요소에 `theme-galaxy` / `theme-paper` 클래스로 적용. 렌더 전 `localStorage.meet4u_theme` 을 읽어 FOUC 방지.

---

## 7. PWA / 배포

**F-PWA-01 · manifest.json**
- `name`, `short_name`, `start_url:'/'`, `scope:'/'`, `display:'standalone'`, `orientation:'portrait'`
- icons: 192/512 각각 `any` + `maskable`, apple-touch-icon 180
- `theme_color`, `background_color`

**F-PWA-02 · Service Worker**
- 단일 `/sw.js` 에 PWA 캐싱 + FCM 백그라운드 처리 통합
- Network-First 전략 (Firestore/googleapis 요청은 캐시 제외)
- 오프라인 fallback: `/offline.html`
- 등록 직후 `/sw.js` 이외의 SW 는 `unregister()` (레거시 정리)

**F-PWA-03 · Android TWA**
- PWABuilder 로 APK/AAB 생성
- `/.well-known/assetlinks.json` 에 Digital Asset Links 배치 → 주소창 숨김

**F-PWA-04 · 서버 용량 신호등**
- 화면 우측 하단 고정 배터리 위젯
- 서버리스 환경이므로 클라이언트 카운터 + 무료 티어 한도로 산출
  - Firestore reads/writes/deletes(일), Storage 바이트(일), Functions 호출(월)
- 임계값 40/70/90% → `ok`(초록) / `warn`(노랑) / `danger`(주황) / `critical`(빨강)
- 모션: critical 0.6s pulse, danger 1.2s, warn breathing, ok 정적

---

## 8. 완료 기준 (Acceptance Criteria)

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | cap=3 모집에 게스트 3명 참가 | 자동으로 `마감` 뱃지 표시, 이후 신청은 대기열로 |
| AC-02 | 마감된 모임에 대기 등록 후 참가자 1명 취소 | 대기 1번이 자동 입장 + 양쪽에 알림 |
| AC-03 | 1인당 5,000원 설정 후 톡에 공유 | 복사 텍스트의 금액·인원이 화면과 정확히 일치 |
| AC-04 | 실력 3.0 + 혼복 + 충장 동시 선택 | 세 조건의 교집합만 노출 |
| AC-05 | 프로젝트 미소속 신규 계정 로그인 | 캘린더가 비어 있고, 미팅 생성 시 안내 카드 |
| AC-06 | 관리자로 지정된 계정 첫 로그인 | 새로고침 없이 즉시 모든 메뉴 활성화 |
| AC-07 | 같은 대화방에 메시지 5개 연속 수신 | 알림이 쌓이지 않고 최신 1개로 갱신 |
| AC-08 | 채팅방을 앱에서 열기 | 그 방의 잠금화면 알림이 자동 제거 |
| AC-09 | 정회원 로그인 | 월간 모임 **모아보기** 뷰로 바로 진입 |
| AC-10 | 일반회원 로그인 | 게스트 모집 페이지로 바로 진입 |
| AC-11 | 설정에서 언어를 English 로 변경 후 저장 | 이후 받는 채팅 메시지가 영어로 번역되어 표시 |
| AC-12 | 카카오톡 인앱 브라우저(안드로이드/iOS) 접속 | 레이아웃 깨짐 없음, 클립보드 복사 정상 동작 |

---

## 9. 비기능 요구사항

| 항목 | 요구 |
|---|---|
| 성능 | 초기 번들 gzip 550KB 이하, LCP 2.5s 이내(4G) |
| 접근성 | 모든 아이콘 버튼에 `aria-label`, 장식 요소에 `aria-hidden` |
| 모션 | `prefers-reduced-motion: reduce` 존중 |
| 오프라인 | 앱 셸 캐싱 + `/offline.html` fallback |
| 다국어 | UI 3종(ko/en/zh) + 메시지 번역 20종 |
| 보안 | Firestore 규칙으로 서버측 강제. 클라이언트 필터는 UX 보조일 뿐 |
