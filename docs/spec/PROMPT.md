# PROMPT — PromiseU 재현용 AI 에이전트 지시문

> 다른 프로젝트에서 이 제품을 처음부터 만들 때, AI 코딩 에이전트(Claude Code / Cursor / Antigravity 등)에게
> 그대로 붙여넣을 수 있는 프롬프트 모음.
>
> **사용법**: `PRD.md`, `TRD.md`, `ERD.md` 를 프로젝트 루트의 `docs/spec/` 에 함께 두고,
> 아래 프롬프트를 순서대로 실행한다. 각 단계는 독립적으로 검증 가능하도록 설계되어 있다.

---

## 0. 마스터 프롬프트 (한 번에 전체를 맡길 때)

```
당신은 시니어 프론트엔드 엔지니어입니다.
docs/spec/ 아래 PRD.md, TRD.md, ERD.md 세 문서를 정독한 뒤,
그 명세를 100% 충족하는 웹앱을 처음부터 구현하세요.

■ 절대 원칙
1. 세 문서에 적힌 필드명·컬렉션명·localStorage 키·태그 규칙을 글자 그대로 지킬 것.
   임의로 이름을 바꾸면 나중에 데이터 마이그레이션이 불가능해집니다.
2. TRD 9장 "알려진 함정(Pitfalls)" 11가지는 이미 실제로 겪은 버그입니다.
   구현 전에 반드시 읽고, 각 항목의 해결책을 처음부터 적용하세요.
3. 보안은 Firestore 규칙으로 강제합니다. 클라이언트 필터는 UX 보조일 뿐입니다.
   ERD.md 4장의 규칙 전문을 그대로 배포하세요.
4. 동시성이 걸린 조작(게스트 모집 참가/취소/대기 승격)은 반드시
   runTransaction 안에서 read → validate → write 순으로 처리하세요.
5. 모바일 우선. 카카오톡 인앱 브라우저(안드로이드/iOS)에서 레이아웃이 깨지지 않아야 합니다.

■ 진행 방식
아래 8단계를 순서대로 진행하고, 각 단계가 끝날 때마다
`npm run build` 가 성공하는지 확인한 뒤 다음으로 넘어가세요.

  1단계: 프로젝트 스캐폴딩 + Firebase 연결 + 인증
  2단계: 프로젝트(Project) 도메인 + 권한 체계
  3단계: 캘린더 + 미팅 CRUD
  4단계: 게스트 모집 (트랜잭션 도메인)
  5단계: 다국어 채팅
  6단계: 지도 + 위치 공유
  7단계: 대시보드 + 관리자
  8단계: PWA + 푸시 알림

각 단계의 상세 지시는 docs/spec/PROMPT.md 의 해당 섹션을 참조하세요.
```

---

## 1단계 — 스캐폴딩 + 인증

```
docs/spec/TRD.md 의 1~3장을 기준으로 프로젝트 기반을 만드세요.

■ 스캐폴딩
- Vite + React 19 + Tailwind CSS 3
- react-router-dom v7 의 HashRouter 사용 (정적 호스팅 대응)
- TRD 2장의 디렉터리 구조를 그대로 생성

■ Firebase 연결
- src/lib/firebase.js 에서 Auth, Firestore, Storage, Messaging 초기화
- 환경변수는 VITE_FIREBASE_* 접두사

■ AuthContext (src/context/AuthContext.jsx)
TRD 4.1 의 코드를 그대로 구현하세요. 특히 다음 두 가지가 핵심입니다:

1) users/{uid} 프로필을 getDoc 이 아닌 onSnapshot 으로 구독할 것.
   - 이유: 로그인 직후 auth 토큰이 Firestore 로 전파되기 전
     permission-denied 가 나는데, 일회성 read 면 프로필이 null 로 굳어
     "관리자인데 메뉴가 회색으로 보이고 새로고침해야 정상" 버그가 발생합니다.
   - onSnapshot 은 자동 재시도 + role 변경 즉시 반영이 됩니다.

2) Provider 가 {!loading && children} 으로 게이팅할 것.
   - 하위 컴포넌트가 마운트될 때 currentUser/userProfile 이 이미 준비되어야 합니다.

■ 로그인 화면
- 구글 로그인 (signInWithPopup)
- 카카오 로그인 (OAuth code flow → Netlify Function → Custom Token)
  · 카카오 계정은 email 이 null 일 수 있으므로 {uid}@kakao.local 로 대체
  · 로그인 직후 AuthContext.currentUser 가 세팅될 때까지 기다린 뒤 navigate
    (즉시 navigate 하면 PrivateRoute 가 /login 으로 되돌립니다)

■ PrivateRoute
React state 뿐 아니라 Firebase SDK 의 동기 API 도 함께 확인:
    const authed = Boolean(currentUser || auth.currentUser);
카카오 로그인 직후 race condition 을 막기 위함입니다.

■ 검증
- 구글 로그인 → users/{uid} 문서 자동 생성 확인
- 로그아웃 → /login 리다이렉트 확인
```

---

## 2단계 — 프로젝트 도메인 + 권한 체계

```
docs/spec/PRD.md 3장·4.2장, ERD.md 2.2·2.10장을 기준으로 구현하세요.

■ ProjectContext (src/context/ProjectContext.jsx)
- projects 컬렉션을 where('memberEmails','array-contains', myEmail) 로 구독
- currentProjectId 를 localStorage('meet4u_current_project_id')에 영속

★ 매우 중요한 fallback 로직:
    useEffect(() => {
        if (loading) return;                    // ← 여기에 projects.length===0 을 넣지 말 것!
        const found = projects.find(p => p.id === currentProjectId);
        if (!found) setCurrentProjectId(projects[0]?.id || null);
    }, [projects, currentProjectId, loading]);

  projects.length === 0 조건으로 early-return 하면, 신규 가입자의
  currentProjectId 가 localStorage 기본값으로 남아 남의 프로젝트 일정을
  전부 보게 되는 보안 사고가 발생합니다.

■ 권한 체계 (src/lib/menuPermissions.js)
- GROUPS = ['general','full','special','admin']
- 한글 라벨: 일반회원 / 정회원 / 특별회원 / 관리자
- 뱃지 축약: full→'정', special→'특', admin→'관', general→null
- getUserGroup(userProfile), canAccessMenu(...), minRequiredGroup(...) 구현
  (ERD.md 2.10 의 코드 참조)

★ useMenuPermissions 훅은 반드시 onAuthStateChanged 안에서 구독을 시작할 것:
    useEffect(() => {
        let configUnsub = null;
        const authUnsub = onAuthStateChanged(auth, (user) => {
            if (configUnsub) { configUnsub(); configUnsub = null; }
            if (!user) { setPermissions(DEFAULT_PERMISSIONS); setLoaded(true); return; }
            setLoaded(false);
            configUnsub = onSnapshot(doc(db,'config','menuPermissions'), ...);
        });
        return () => { authUnsub(); configUnsub?.(); };
    }, []);

  mount 시점에 바로 onSnapshot 을 걸면 permission-denied 로 실패하고
  재시도가 없어서 "같은 계정인데 브라우저마다 메뉴가 다르게 보이는" 버그가 납니다.

■ 사이드바
- 모든 메뉴를 항상 렌더. 권한 없는 항목은:
  · 텍스트 opacity 25% 회색
  · <Link> 대신 <div> (클릭 불가)
  · 최소 요구 등급 뱃지를 회색 톤으로
- 프로필 카드에 회원 등급 뱃지 (색상은 PRD 3장 표 참조)
- 하단: 로그아웃 버튼 + 이메일 문의 원형 버튼

■ 프로젝트 관리 페이지 (/projects)
- 생성(이름·이모지·색상), 회원 검색 초대, 멤버 제거
```

---

## 3단계 — 캘린더 + 미팅

```
docs/spec/PRD.md 4.3장, ERD.md 2.3장을 기준으로 구현하세요.

■ 주간 모임 (/weekly)
- 이번 주 중 일정이 있는 날짜만 카드로

■ 월간 모임 (/calendar)
- grid / list(모아보기) 두 뷰 모드, localStorage('meet4u_calendar_view')로 영속
- 상단 우측 "+ 미팅 생성" — 프로젝트 없으면 회색 + /projects 유도

★ 프로젝트 스코프 보안 게이트 (두 캘린더 모두 적용):
    const myProjectIds = useMemo(() => new Set(projects.map(p => p.id)), [projects]);
    if (!currentProjectId) return [];
    return meetings
        .filter(m => myProjectIds.has(m.projectId || DEFAULT_PROJECT_ID))   // 1차: 멤버십
        .filter(m => (m.projectId || DEFAULT_PROJECT_ID) === currentProjectId) // 2차: 현재 선택
        .filter(m => !m.hidden || isAdmin);

  currentProjectId 만 신뢰하면 stale 값으로 남의 일정이 노출됩니다.

■ 미팅 생성 폼 (/schedule)
- 프로젝트 미소속이면 폼 대신 "먼저 프로젝트가 필요해요" 안내 카드 + /projects 버튼
- 대여 비용은 { cost, bookedBy } 다중 항목
- ★ 예약자 드롭다운은 currentProject.memberEmails 로만 좁힐 것.
  전체 users 를 노출하면 개인정보 유출입니다.
  memberEmails 가 비어 있으면 전체가 아니라 빈 배열을 반환하세요.

■ 미팅 상세 모달
- 참석/불참 저장 시 onClose() 도 함께 호출 (팝업 자동 닫힘)
- 헤더 우측: 관리자 전용 원형 버튼(ShieldCheck) → 참석 강제 지정 모달
- 참석/불참 옆: "게스트 초대" 버튼 → 4단계에서 만들 게스트 모집 폼으로
  seed(date/start/end/place/level='2.5'/type='남복'/meetingId) 전달
- 게스트 초대가 마감되면 버튼이 인디고 필드로 반전 + "초대 N명 완료"
  (guestMeetups where meetingId==this.id and createdBy==me 를 onSnapshot 구독)
- 댓글 스레드 + 스코어보드
```

---

## 4단계 — 게스트 모집 (핵심 트랜잭션 도메인)

```
docs/spec/PRD.md 4.4장, TRD.md 4.3장, ERD.md 2.4장을 기준으로 구현하세요.
이 단계가 이 제품에서 가장 까다로운 부분입니다.

■ 데이터 레이어 (src/lib/guestMeetups.js)
TRD 4.3 의 코드를 그대로 구현하세요. 반드시 지킬 것:

1) capTotal = cap + 1  (호스트 1명 + 게스트 cap명)
2) 화면 표시는 호스트를 제외한 게스트 기준:
       guestCount = roster.length - (roster[0]?.host ? 1 : 0)
       표시        = `${guestCount}/${cap}명`
   예) cap=3, 게스트 2명 → "2/3명"  (❌ "3/4명" 아님)
3) joinMeetup / leaveMeetup / waitMeetup / cancelWait / setPaid 전부 runTransaction
4) leaveMeetup 에서 자리가 나면 wait[0] 을 자동 승격하고,
   승격된 roster 원소에 promotedFromWait:true, promotedAt 을 마킹
5) joinMeetup 은 마감 시 finalRoster 와 closingMessage 를 함께 리턴
   (호출측이 알림 대상을 정확히 알아야 하므로)
6) perHead 는 m.perHeadAmount 우선, 없으면 레거시 계산식 fallback
7) placePrefix 로 코트 번호를 제거해 필터 chip prefix 생성

■ 목록 화면 (/guest-meetups)
- 팔레트는 PRD 6.2 의 크림 톤 CSS 변수를 인라인 스타일로 적용
  (Tailwind 로 표현하기 어려운 톤이므로 인라인 style 객체 사용)
- 상단 탭: [전체보기](기본) / 모집중 / 내 참가 / 내 대기
- 필터 chip 3종 AND 조합:
  · 장소 — ★ 프리셋 시드 없이 등록된 모임에서만 prefix 수집
    const set = new Set();
    meetups.forEach(m => { const p = placePrefix(m.place); if (p) set.add(p); });
  · 실력 NTRP — 2.0/2.5/3.0/3.5
  · 경기 — 여단/남단/혼복/남복/여복
- 정렬 4종: 날짜 빠른순/장소순/잔여석 많은순/실력순
- 날짜 그룹 헤더: "8월 8일 (토)" · 토=파랑(#2f6f8f), 일=빨강
- 관리자에게만 chip 옆 ✏️(writeBatch 로 일괄 rename) / 🗑(일괄 삭제)
- 헤더 우측: 🔗 링크복사 · + 모임 만들기  (톡에 공유는 상세 모달에만)

■ 생성 폼
- 필드: 날짜 / 모집인원 / 시작 / 종료 / 장소(자유 텍스트) / 실력 / 경기
       / 1인당 비용 (선택) / 입금 계좌 (선택) / 마감메세지 (선택) / 메모 (선택)
- ★ 장소·계좌번호·예금주는 localStorage 기본값에 저장하지 말 것.
  저장하면 다음 생성 때 이전 실명·계좌가 자동으로 채워져 placeholder 가 안 보입니다.
  은행 종류만 기본값 유지.
- 마감메세지 placeholder: 예: 모임인원이 확정되었습니다. "코트는 2번입니다."
- 은행 목록에 '카톡입금' 포함
- seed prop 을 받아 초기값 fallback 체인 구성: editing > seed > defaults > 기본값

■ 상세 모달 (바텀시트)
- 헤더에 "📋 톡에 공유" pill 버튼
  복사 텍스트는 PRD 4.4 F-GUEST-07 포맷 그대로.
  ★ 반드시 화면과 동일한 기준(cap, 게스트 카운트)을 사용할 것.
    capTotal 을 쓰면 화면과 숫자가 달라집니다.
- 정산: perHeadAmount 있으면 1인당만 크게, 없으면 레거시 breakdown
- 참가자 목록: 입금완료 체크박스, promotedFromWait 이면 "🎉 대기승격" 초록 뱃지
- 계좌 복사 버튼
- 호스트: 수정 / 수동 마감·재개 / 삭제

■ 딥링크
TRD 4.9 대로 구현:
- URL: /#/guest-meetups?open=<id>
- main.jsx 에서 앱 마운트 전에 hash 를 파싱해 sessionStorage 에 stash
  (PrivateRoute 리다이렉트로 쿼리가 유실되므로)
- 페이지에서 location.search → sessionStorage 순으로 확인해 상세 자동 오픈

■ 검증 (PRD 8장 AC)
- cap=3 에 게스트 3명 → 자동 "마감" 뱃지
- 마감 상태에서 대기 등록 → 참가자 1명 취소 → 대기 1번 자동 입장
- 1인당 5,000원 설정 → 톡에 공유 텍스트의 금액·인원이 화면과 일치
- 실력 3.0 + 혼복 + 충장 동시 선택 → 교집합만
```

---

## 5단계 — 다국어 채팅

```
docs/spec/PRD.md 4.5장, ERD.md 2.5장을 기준으로 구현하세요.

■ 채팅방 (/chat-check)
- globalChatRooms 컬렉션. members 배열로 read 권한 제어
- 방 선택 드롭다운 + 참여자 + 새 대화방

■ ★ 대화방 생성 시 초대 대상 제한
    const candidates = useMemo(() => {
        if (projects.length === 0) return [];      // ← 전체 users 로 fallback 하지 말 것!
        // 내가 속한 프로젝트들의 memberEmails 합집합만
    }, [projects, projectFilter, allUsers]);

- 프로젝트 0개 → 모달 대신 "먼저 프로젝트가 필요해요" 안내 + /projects 버튼
- 프로젝트 2개 이상 → 상단에 프로젝트 필터 chip, 검색 결과에 소속 프로젝트 태그

■ 메시지 번역/발음
- 발신: sourceLanguage = 내 preferredLanguage
- 수신: 내 preferredLanguage 로 번역 (Netlify Function 프록시)
- 번역문 아래 한글 발음 표기 자동 생성 (로마자/병음/가나 → 한글)
- 번역·발음은 문서에 캐시해 재요청 방지
- 지원 언어 20종 (PRD 4.8 F-SET-06 표)

■ 메시지 액션 (말풍선 옆 세로 버튼)
- 🔊 TTS  ← ★ TRD 4.5 의 청킹 구현 필수.
   Google TTS 는 200자 제한이라 그냥 자르면 문장이 중간에 끊깁니다.
   문장 경계로 나눠 순차 재생하고, HTMLAudioElement 유사 인터페이스
   (.play/.pause/onended/onerror)를 노출하는 컨트롤러를 반환하세요.
- 📋 복사
- 📖 문법 분석 (Gemini)

■ 상단 도구 바
👥 참여자 / 🔇 자동음성 / 💬 직접말하기 / 📡 라이브통역 / 📄 회의록 / ➕ 새 대화방

■ Gemini 연동
- ★ TRD 4.6 의 모델 fallback 리스트 필수 (gemini-1.5-flash 는 404 남)
- ★ TRD 4.7 의 useGeminiApiKey 훅 — Firestore 저장으로 기기 간 동기화
- Live API 는 AIza 형식 키만 허용 (AQ. OAuth 토큰은 1008 오류)

■ 회의록 생성
- 기간 프리셋(오늘/어제/3일/7일/30일/사용자 지정) + 프롬프트 편집 + .md 다운로드
```

---

## 6단계 — 지도 + 위치 공유

```
docs/spec/PRD.md 4.6장, ERD.md 2.6·2.7장을 기준으로 구현하세요.

■ 지도
- Leaflet + OSM 타일 + MarkerClusterGroup
- zoom >= 10 이면 핀 아래 제목 앞 2글자 라벨(permanent Tooltip)
  · ZoomWatcher helper 로 map.on('zoomend') 구독 → 상위 state 갱신
  · CSS: .leaflet-tooltip.pin-label-tooltip { 어두운 pill, ::before 숨김 }

■ ★ react-leaflet-cluster 호환 주의 (TRD 4.4)
  <MarkerClusterGroup> 자식 <Marker> 에 callback ref 를 달면
  react-leaflet 5.x + react-leaflet-cluster 4.1.3 조합에서
  "TypeError: VM is not a constructor" 로 페이지가 통째로 크래시합니다.
  반드시 useMap() + map.eachLayer() 좌표 매칭으로 우회하세요.

■ 핀 검색
- 외부 지도 API 가 아닌 등록된 핀만 실시간 필터
- 결과 클릭 → zoom 17 확대 이동 + 팝업 자동 오픈(1.3s 지연)

■ 핀 추가 (관리자 전용, 4중 게이트)
1) 주소 입력 폼 자체를 isAdmin 일 때만 렌더
2) handleMapClick 에서 !isAdmin 이면 early return
3) 검색 결과 클릭 시 관리자만 pending pin 생성, 일반은 지도 이동만
4) handleAddPin / handleConfirmPendingPin 진입부에 alert 가드

■ 내 위치 공유 (프로젝트 단위)
- [내 위치 공유] → 프로젝트 선택 모달(다중 선택) → 최소 1개 필수
- liveLocations/{uid}.audienceProjectIds 에 저장
- 구독 필터: ERD 2.6 의 freshSharedUsers 로직 그대로
  · 10분 초과 stale 제거
  · 내 자신은 항상 표시
  · audienceProjectIds 미지정 레거시는 남에게 비공개
```

---

## 7단계 — 대시보드 + 관리자

```
docs/spec/PRD.md 4.7·4.9장을 기준으로 구현하세요.

■ My 대시보드 (/my-dashboard)
1) 참석 현황 — 이달/올해/전체
2) 게스트 참석 현황 — guestMeetups 에서 host=false 로 roster 에 있는 문서 수
3) 비용 현황 — 월 이동, 낼 금액/예약 금액/정산 차액
4) 경기 통계 — 참여/승/무/패 + 승률 도넛
5) 프로젝트별 통계 — 카드마다 참석·경기·승률·W/D/L 스택 바
6) 프로젝트별 상세 통계 (관리자 페이지에서 이관)
   - 프로젝트 필터 chip (전체 / 개별)
   - 월별 참석 통계 (AttendanceStats)
   - 월별 비용 관리 (CostManagement)
   ★ 필터 시 legacy 미팅 fallback 필수:
       const pid = m.projectId || DEFAULT_PROJECT_ID;
     이걸 빼면 projectId 없는 옛 미팅이 어느 chip 에서도 안 보입니다.

■ 관리자 (/admin) — 탭 3종
1) 회원 관리 — 등급 변경, 관리자 지정/해제, 삭제
2) 전체 미팅 — 프로젝트 뱃지(아이콘+이름+색상) + 숨기기/수정/삭제
   · projectId 있는데 프로젝트 삭제됨 → 회색 "프로젝트 없음"
   · projectId 없음 → "미분류"
3) 권한 관리 — 메뉴 × 등급 체크박스 매트릭스 → config/menuPermissions

■ 설정 (/settings)
1) 앱 제목 변경
2) Gemini API 키 (TRD 4.7)
3) 테마 3종
4) 푸시 알림 권한
5) 구글 캘린더 연동
6) ★ 프로필 + 언어 설정 — PRD 4.8 F-SET-06 의 20종 드롭다운 그대로.
   users/{uid}.preferredLanguage 에 저장.
   ※ 사이드바의 LanguageSwitcher(UI 언어 ko/en/zh) 와는 다른 개념이므로
     반드시 분리해서 구현하세요.
```

---

## 8단계 — PWA + 푸시 알림

```
docs/spec/PRD.md 4.10·7장, TRD.md 4.8·7장을 기준으로 구현하세요.

■ PWA
- public/manifest.json — icons 192/512 각각 any + maskable
- public/sw.js — 캐싱(Network-First) + FCM 통합 단일 SW
- public/offline.html
- index.html 에 manifest 링크 + og 태그 + 테마 FOUC 방지 스크립트
- SW 등록 직후 /sw.js 외 레거시 SW 전부 unregister
- public/_headers 로 SW/manifest 캐시 제어

■ 푸시 알림 4종
| 이벤트 | 수신자 | tag |
| 대화방 새 메시지 | 방 멤버(발신자 제외) | chat-{roomId} |
| 미팅 참석 변경 | 참석자+예정자 | attend-{meetingId} |
| 게스트 모집 참가 | 호스트 | gjoin-{meetupId} |
| 게스트 모집 마감 | 참가자 전원 | gfull-{meetupId} |
| (부가) 대기 승격 | 승격자 | gpromo-{meetupId}-{uid} |

■ ★ 중복 방지 3중 방어선 (TRD 4.8) — 이게 없으면 예전 알림이 계속 쌓입니다
1) 서버: FCM webpush.headers.Topic 에 sanitize한 tag (URL-safe, 32자)
2) SW: payload.data.tag 를 안정 태그로 사용. Date.now() 절대 금지
3) 클라이언트: SW 에 CLEAR_NOTIF postMessage 리스너.
   채팅방 진입 시 그 방의 남은 알림을 close()

■ Netlify Function (send-notification)
- recipientEmails / recipientUids 두 경로 지원
- senderEmail / senderUid 로 자기 자신 제외
- data-only 메시지 (webpush.notification 필드 제거)
- 무효 토큰은 응답 코드로 판별해 Firestore 에서 자동 제거

■ Android TWA
1) pwabuilder.com 에서 배포 URL → Android 패키지 생성
2) 생성된 assetlinks.json 을 public/.well-known/ 에 배치
3) https://<도메인>/.well-known/assetlinks.json 응답 확인
4) APK 설치 후 주소창이 숨겨지면 성공

■ 서버 용량 신호등
- 우측 하단 fixed 배터리 위젯
- 서버리스이므로 클라이언트 카운터 + 무료 티어 한도로 산출
- 임계 40/70/90% → ok/warn/danger/critical
- 모션: critical 0.6s pulse, danger 1.2s, warn breathing, ok 정적
```

---

## 9. 모바일 UX 전용 프롬프트

```
docs/spec/PRD.md 5.3·5.4장을 기준으로 모바일 전용 화면을 만드세요.

■ 모바일 카드 홈 (/menu)
전체 화면 큰 카드 메뉴. 참조 레이아웃:

    어느 모임에 활동해 볼까요? 👋
    큰 버튼을 눌러 원하는 화면을 여세요

    ┌────────────────────────────┐
    │ [🏠]  주간 모임      [정] →│   ← 16x16 컬러 아이콘 박스
    │       이번 주 약속 한눈에  │      + 굵은 제목 + 서브카피
    └────────────────────────────┘

- 컬러/서브카피 매핑은 PRD 5.3 표 그대로
- 권한 없는 카드: 아이콘 회색 + "권한이 없어요 · 잠금" + 클릭 불가
- 하단에 시스템 섹션(설정/관리자) 구분

■ 모바일 헤더 (MainLayout)
    [▦]  📅 앱제목        [🌐 한국어] [⎋] [🔔]
     ↑                                 ↑
     /menu 복귀 (LayoutGrid)      로그아웃 원형(붉은톤)

- 햄버거(☰) 없음 — /menu 와 기능이 중복이므로 제거
- 로그아웃은 confirm 후 실행
- /menu 페이지에서는 홈 버튼을 렌더하지 않음 (자기 자신 링크 방지)

■ 모바일 사이드바 (열었을 때)
- 너비 w-[min(88vw,360px)], 데스크톱은 md:w-20 / md:w-64
- 데스크톱 요소(컴팩트 nav, 프로젝트 리스트)는 hidden md:* 로 감쌈
- 모바일 전용 카드 리스트 + chip 형태 프로젝트 스위처

■ 로그인 직후 라우팅 (PRD 3.3)
    const group = isAdmin ? 'admin' : getUserGroup(userProfile);
    const isPremium = ['full','special','admin'].includes(group);
    if (isPremium) {
        localStorage.setItem('meet4u_calendar_view', 'list');  // 모아보기
        return '/calendar';
    }
    return '/guest-meetups';
```

---

## 10. 리팩터링/디버깅용 프롬프트 스니펫

### 10.1 함정 점검
```
docs/spec/TRD.md 9장의 알려진 함정 11가지를 현재 코드베이스에서 점검하세요.
각 항목마다 (a) 해당 코드 위치 (b) 현재 상태(취약/안전) (c) 필요한 수정을
표로 정리한 뒤, 취약한 것부터 순서대로 고치세요.
```

### 10.2 보안 감사
```
docs/spec/ERD.md 4장의 Firestore 규칙과 현재 클라이언트 코드를 대조해,
"클라이언트에서는 막았지만 규칙에서는 열려 있는" 지점을 찾아내세요.
특히 다음을 확인:
- 프로젝트 미소속 사용자가 남의 미팅/대화방을 읽을 수 있는가
- 게스트 모집에서 참가자가 roster 이외 필드를 조작할 수 있는가
- 핀 추가가 서버측에서도 관리자로 제한되는가
```

### 10.3 알림 중복 진단
```
푸시 알림이 중복되거나 예전 알림이 쌓인다면 다음 3가지를 순서대로 확인하세요:
1) SW 의 showNotification 에서 tag 에 Date.now() 를 쓰고 있는가
   → payload.data.tag 를 그대로 쓰도록 수정
2) Netlify Function 이 webpush.headers.Topic 을 보내고 있는가
   → sanitizeTopic(tag) 추가
3) 사용자가 콘텐츠를 확인했을 때 알림을 close 하는가
   → SW 에 CLEAR_NOTIF 리스너 + 클라이언트에서 postMessage
```

### 10.4 프로젝트 스코프 누락 점검
```
프로젝트 단위로 격리되어야 하는데 누락된 곳이 있는지 점검하세요.
체크리스트:
- [ ] 주간/월간 캘린더가 myProjectIds 게이트를 통과시키는가
- [ ] 미팅 생성 폼의 예약자 드롭다운이 프로젝트 멤버로만 좁혀지는가
- [ ] 대화방 생성 시 초대 후보가 프로젝트 멤버 합집합인가
- [ ] 위치 공유가 audienceProjectIds 로 필터되는가
- [ ] 대시보드 통계가 projectId 필터를 적용하는가 (legacy fallback 포함)
각 항목에서 fallback 으로 "전체"를 반환하는 코드가 있다면 그것이 곧 정보 유출입니다.
```

---

## 11. 체크리스트 (구현 완료 판정)

```
docs/spec/PRD.md 8장의 AC-01 ~ AC-12 를 하나씩 실제로 실행해 보고,
각 항목의 통과 여부를 표로 보고하세요. 실패한 항목은 원인과 수정 계획을 함께 적으세요.

  AC-01  cap=3 에 3명 참가 → 자동 마감
  AC-02  마감 후 대기 등록 → 참가자 취소 → 대기 1번 자동 입장
  AC-03  톡에 공유 텍스트의 금액·인원이 화면과 일치
  AC-04  실력+경기+장소 필터 교집합
  AC-05  프로젝트 미소속 신규 계정 → 빈 캘린더 + 안내 카드
  AC-06  관리자 첫 로그인 → 새로고침 없이 메뉴 활성화
  AC-07  같은 방 메시지 5개 → 알림 1개로 갱신
  AC-08  채팅방 열면 잠금화면 알림 제거
  AC-09  정회원 로그인 → 월간 모임 모아보기
  AC-10  일반회원 로그인 → 게스트 모집
  AC-11  설정 언어 변경 → 채팅 번역 타깃 변경
  AC-12  카카오톡 인앱 브라우저 레이아웃/클립보드 정상
```
