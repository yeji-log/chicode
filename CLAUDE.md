# CHICODE — Claude 세션 인계 문서

이 파일은 Claude Code가 이 폴더를 열 때 계정과 무관하게 자동으로 읽는다.
다른 계정/세션에서 이어서 작업할 때는 이 문서 하나로 맥락을 따라잡을 수 있어야 한다.
**작업 방식(맨 아래 "작업 스타일" 절)까지 반드시 지켜서 이어가야 이전 세션과
톤이 어긋나지 않는다.**

## 무엇을 만들고 있나

교사·학생용 교육 플랫폼. 수업자료, 브라우저 기반 코딩 실습(Python·C),
Firebase Google 로그인 기반 교사 인증. 학생은 회원가입 없이 이용한다.
브랜드: "치즈처럼 즐겁게, 코드처럼 단단하게" — 치즈 캐릭터 마스코트.

실제 코드는 `web/` 안에 있다. 저장소 루트에는 기획 문서와 원본 브랜드 자산만 있다.

- `web/README.md` — 실행 방법, 배포, 각 기능의 기술적 근거 (가장 자세함, 항상 최신)
- `chicode_개발_전략_및_단계별_계획.md` — 최초 기획 문서. **많이 낡았다** —
  Pico 2 W를 MVP에 넣었지만 실제로는 뒤로 미뤘고, C언어 실습은 여기 아예 없다.
  전체 방향성 참고용으로만 보고, 세부 사항은 이 문서와 커밋 로그를 믿을 것.
- `수업자료_과목별_핀잠금_구현_계획.md` — **다음에 할 일**. 아래 "다음 계획" 참고.

## 지금까지 만든 것 (동작 확인됨)

| 기능 | 위치 | 비고 |
|---|---|---|
| 홈 화면 | `/` | 히어로 배경(hero-desk.webp, 알파 페이드), Jua 폰트 |
| 수업자료 | `/materials` | Firestore에 파일을 조각내어 저장(무료 플랜, Storage 안 씀). PDF는 PDF.js로 직접 렌더링 |
| 실습 선택 | `/practice` | Python / C언어 / Pico(준비중) 카드 |
| Python 실습 | `/practice/python` | Pyodide(WASM CPython), Web Worker, 무한루프 중지 가능 |
| C 실습 | `/practice/c` | **진짜 clang을 브라우저에서 실행**. 아래 "C 실습 구조" 참고 |
| 프로젝트 / Lab | `/projects`, `/lab` | 아직 내용 없음, ComingSoon 자리표시자 |
| 교사 인증 | `/teacher` | Firebase Auth(Google) + Firestore `teachers` 컬렉션 화이트리스트 |
| 정책 팝업 | 풋터 | 개인정보처리방침 / 이용약관, 실제 데이터 처리 방식 검증 후 작성함 |

배포: **Vercel**(`chicode-psi.vercel.app`, 메인)과 **GitHub Pages**
(`yeji-log.github.io/chicode`, 보조) 둘 다 `main` push 시 자동 배포.
Firebase 승인 도메인은 Vercel 쪽만 등록되어 있다 (GitHub Pages는 로그인 안 됨,
사이트 자체는 열림 — 의도된 상태, 이유는 커밋 로그 `Firebase 승인 도메인` 검색).

## 핵심 설계 원칙 (왜 이렇게 했는지)

1. **서버 비용 0원.** Python/C 실행 전부 브라우저 안에서 돈다. Firebase도
   무료(Spark) 플랜 — Storage는 새 프로젝트에서 유료 플랜을 요구해서 안 쓰고,
   파일을 Firestore에 조각내어 저장한다(`web/src/lib/materials.ts`).
2. **외부 CDN 의존 금지.** 학교 네트워크가 CDN을 막을 수 있다는 전제.
   Pyodide, Monaco, PDF.js, clang 전부 자체 호스팅(`npm install` 시
   postinstall 스크립트가 자동으로 받아온다 — `scripts/sync-*.mjs`).
3. **프론트엔드 검사는 장식일 뿐, 진짜 방어선은 `firestore.rules`.**
   교사 권한 확인은 반드시 Firestore 규칙에서도 검증되어야 한다.
4. **claim하기 전에 실제로 검증한다.** 이 프로젝트 전체에서 "될 것 같다"가
   아니라 브라우저에서 직접 실행해 확인하는 방식으로 진행했다. 아래 "C 실습
   구조"의 버그 두 개(JSCPP 공백/한글 버그, WASI inode 버그)는 전부 실제로
   재현해서 찾아낸 것이다. 다음 세션도 이 방식을 유지할 것 — 특히 새 라이브러리
   도입 전엔 npm 패키지를 실제로 설치해 Node나 브라우저에서 최소 재현으로
   먼저 검증하고, 그 다음에 실제 코드에 붙인다.

## C 실습 구조 (가장 복잡한 부분)

`web/src/c/` 안에 있다. clang.wasm + wasm-ld.wasm(binji/wasm-clang, LLVM 8)을
받아서 브라우저에서 컴파일→링크→실행까지 전부 처리한다.

- **WASI를 직접 구현했다** (`wasi.ts`, 기성 라이브러리 안 씀). 이 wasm들은 구형
  `wasi_unstable`(snapshot_0) ABI를 쓰는데, 널리 쓰이는 라이브러리는
  `wasi_snapshot_preview1`이라 구조체 배치가 다르다(filestat st_nlink 크기,
  fd_seek whence 순서).
- **SharedArrayBuffer를 의도적으로 피했다.** 기성 런타임(runno 등)은 stdin
  블로킹 때문에 SAB를 쓰는데, 그러면 COOP/COEP 헤더가 필요하고, 그 헤더가
  Google 로그인 팝업을 막아버린다(직접 겪음). Python처럼 stdin을 미리
  다 받아두는 방식이라 SAB 없이도 된다.
- **파일마다 고유 inode를 줘야 한다.** 전부 0으로 주면 LLVM이 서로 다른 파일을
  같은 파일로 착각해서 `stdio.h`를 열면 방금 읽은 `main.c` 내용이 나오는
  버그가 났다 (`MemFS.inodeOf`).
- **JSCPP(가벼운 C 인터프리터)는 검토 후 버렸다.** `printf("A, B")`가
  `A,B`로 나오고(공백 삼킴) 한글은 오류가 남 — 실제 테스트로 확인.
- 제약: C++ 안 됨, 파일 하나만, 네트워크 불가, 파일이 실행마다 초기화됨.
  (`web/src/pages/CLab.tsx`의 SupportNote에 학생용으로도 안내되어 있음)

## 검토했지만 아직 안 만든 것

**Python에 numpy/pandas/matplotlib 추가** — 기술 검토 완료, 구현은 안 함.
- 이미 `pyodide.worker.ts`에 `loadPackagesFromImports(code)` 호출이 있다 —
  지금은 조용히 실패할 뿐, 패키지 파일만 채우면 켜지는 구조.
- 실측 용량: numpy 2.8MB, pandas 4.7MB(+dateutil,pytz),
  matplotlib 9.1MB(+pillow,fonttools 등 8개) = 총 16.6MB. **import한 것만
  받아온다** (C 컴파일러와 달리 hello world엔 영향 없음).
- numpy/pandas는 텍스트 출력이라 지금 결과창 그대로 사용 가능.
- **matplotlib은 결과창에 이미지 표시 기능을 새로 만들어야 한다** — 지금은
  텍스트 줄만 그리는 구조. `plt.savefig()` → base64 PNG → 워커 메시지로
  전달 → `<img>` 렌더링, 이 방식이 지금 아키텍처와 가장 잘 맞는다 (라이브
  캔버스 방식은 워커 격리를 깨야 해서 비추천).
- 버전 고정 주의: numpy/pandas/matplotlib wheel은 현재 Pyodide 버전
  (`web/node_modules/pyodide` package.json 확인)에 정확히 맞춰 받아야 한다.

## 다음 계획: 수업자료 과목별 탭 + 핀번호 잠금

`수업자료_과목별_핀잠금_구현_계획.md`에 상세 설계 있음. 요약:

- `/materials`를 과목 선택 화면으로 바꾸고 (정보 / 인공지능 기초 2개로 시작),
  각 과목은 핀번호로 잠근다.
- **의도적으로 가벼운 잠금이다.** Firestore `read: true`는 유지 —
  개발자도구로 핀 값 자체도 볼 수 있는 걸 알고 받아들인 트레이드오프.
  "진짜" 서버 검증이 필요해지면 Blaze 유료 플랜 + Cloud Function이 필요하다는
  것도 문서에 명시되어 있다. **이 트레이드오프를 다음 세션이 몰래 "강화"하려고
  하지 말 것** — 사용자가 의도적으로 정한 범위다.
- 신규 `subjects/{subjectId}` 컬렉션, `materials`에 `subjectId` 필드 추가,
  `sessionStorage`로 잠금 해제 상태 유지(브라우저 닫으면 초기화 — 공용 PC 고려).
- 아직 코드 작업 시작 전. 이 커밋(`4c3c884`)은 **로컬에만 있고 origin에
  push 안 됨** — 다음 세션 시작할 때 push 여부부터 확인할 것.

## 작업 스타일 (중요 — 이 톤을 유지할 것)

- **먼저 검증, 그다음 구현.** "안 될 것 같다"가 아니라 실제로 설치해서
  Node/브라우저에서 돌려보고 확인한다. 라이브러리 채택/기각도 실측(용량,
  실제 실행 결과)으로 판단했다 — 감으로 판단하지 않는다.
- **UI가 걸린 변경은 커밋 전에 로컬에서 스크린샷으로 보여주고 확인받는다.**
  Push는 사용자가 명시적으로 "커밋해줘"/"push해줘"라고 말할 때만 한다.
  묶어서 진행하지 않는다 — 승인 단위를 존중할 것.
- **콘텐츠(정책 문서 등)는 실제 코드 동작을 근거로 작성**하고, 적용 전 텍스트
  초안부터 보여준다.
- 커밋 메시지에 "왜 이렇게 했는지"(특히 버그를 찾은 과정, 버린 대안)를
  자세히 적는 습관이 있다 — 이 문서와 같은 톤으로 유지할 것.
- GitHub Pages 배포 실패 시 먼저 GitHub 자체 장애(status.githubstatus.com)인지
  확인하는 습관이 있었다 — 실제로 두 번 그 원인이었다.
