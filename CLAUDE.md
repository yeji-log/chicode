# CHICODE — Claude 세션 인계 문서

이 파일은 Claude Code가 이 폴더를 열 때 계정과 무관하게 자동으로 읽는다.
다른 계정/세션에서 이어서 작업할 때는 이 문서 하나로 맥락을 따라잡을 수 있어야 한다.
**작업 방식(맨 아래 "작업 스타일" 절)까지 반드시 지켜서 이어가야 이전 세션과
톤이 어긋나지 않는다.**

## 무엇을 만들고 있나

교사·학생용 교육 플랫폼. 수업자료, 브라우저 기반 코딩 실습(Python·C·Pico 2 W
MicroPython), Firebase Google 로그인 기반 교사 인증. 학생은 회원가입 없이 이용한다.
브랜드: "치즈처럼 즐겁게, 코드처럼 단단하게" — 치즈 캐릭터 마스코트.

실제 코드는 `web/` 안에 있다. 저장소 루트에는 기획 문서와 원본 브랜드 자산만 있다.

- `web/README.md` — 실행 방법, 배포, 각 기능의 기술적 근거 (가장 자세함, 항상 최신)
- `chicode_개발_전략_및_단계별_계획.md` — 최초 기획 문서. **많이 낡았다** —
  여기선 Pico 2 W를 MVP에 넣었다가 뒤로 미룬 것으로 적혀 있지만, 실제로는 그 뒤에
  `pico2w_시뮬레이터_구현_계획.md`로 다시 설계해서 이미 구현·배포됐다(아래 표
  참고). C언어 실습은 이 문서엔 아예 없다. 전체 방향성 참고용으로만 보고, 세부
  사항은 이 문서와 커밋 로그를 믿을 것.
- `pico2w_시뮬레이터_구현_계획.md` — Pico 2 W 실습(MicroPython WASM + 가상 회로)의
  설계 문서. **이미 구현되어 배포됨.** MicroPython엔 `machine`(GPIO) 모듈이 원래
  없다는 것, `time.sleep()`이 진짜로 블로킹이라 실시간 버튼 상호작용을 막는다는
  것, 그 해결책(JS async 함수를 Python에서 `await`)까지 전부 실제로 설치해서
  검증한 과정이 담겨 있다 — 세부는 `web/src/pico/`를 믿을 것.
- `수업자료_과목별_핀잠금_구현_계획.md` — 아래 "과목별 탭 + 핀번호 잠금" 기능의 설계
  문서. **이미 구현되어 배포됨** (`main`, 커밋 `63c3f07`). 문서와 실제 코드가 다를 수
  있으니 트레이드오프(가벼운 잠금)의 "왜"만 여기서 확인하고, 세부는 코드를 믿을 것.

## 지금까지 만든 것 (동작 확인됨)

| 기능 | 위치 | 비고 |
|---|---|---|
| 홈 화면 | `/` | 히어로 배경(hero-desk.webp, 알파 페이드), Jua 폰트 |
| 수업자료 — 과목 선택 | `/materials` | 과목 카드(정보 / 인공지능 기초) 목록. `web/src/lib/subjects.ts` |
| 수업자료 — 과목별 자료 | `/materials/:subjectId` | 핀번호 입력 후 열람. `web/src/pages/SubjectMaterials.tsx`. 아래 "과목별 핀잠금" 참고 |
| 실습 선택 | `/practice` | Python / C언어 / Pico(준비중) 카드 |
| Python 실습 | `/practice/python` | Pyodide(WASM CPython), Web Worker, 무한루프 중지 가능. numpy/pandas/matplotlib 사용 가능(matplotlib은 결과창에 이미지로) |
| C 실습 | `/practice/c` | **진짜 clang을 브라우저에서 실행**. 아래 "C 실습 구조" 참고 |
| Pico 2 W 실습 | `/practice/pico` | 회로 캔버스 + 코드 에디터(`PicoLab.tsx`). `PicoGate.tsx`가 교사/학생(설정 공개 여부)로 게이트. Monaco는 진입 시 동적 로드 |
| Lab (활동/발표) | `/lab` | 핀 게이트(`LabGate.tsx`) 아래 홈·로드맵(시즌 카드)·활동 목록·활동 상세. `/materials/:subjectId`에도 로드맵·활동 화면이 과목별로 재마운트됨(`useLabScope`). 교사용 보드 에디터는 `LabBoardEditor.tsx` |
| 시간표 / 수업기록 | `/timetable` | 그리드(`TimetableBoard`)와 반별 수업기록(`ClassRecords.tsx`, 반 탭 드래그 정렬·학생 참여 기록·메모)을 탭 전환 |
| 뉴스 | `/news` | 홈 히어로 "오늘의 AI·IT 이슈" 버튼에서 진입하는 공개 페이지. 교사는 `/teacher`의 뉴스 탭(`TeacherNews.tsx`)에서 후보 관리 |
| 프로젝트 | `/projects` | 아직 내용 없음, ComingSoon 자리표시자 |
| 교사 인증 | `/teacher` | Firebase Auth(Google) + Firestore `teachers` 컬렉션 화이트리스트. Lab/뉴스/과목별 자료 관리 탭도 이 페이지 안에 있음 |
| 정책 팝업 | 풋터 | 개인정보처리방침 / 이용약관, 실제 데이터 처리 방식 검증 후 작성함 |

배포: **Vercel**(`chico-edu.vercel.app`, 메인)과 **GitHub Pages**
(`yeji-log.github.io/chicode`, 보조) 둘 다 `main` push 시 자동 배포.
(예전엔 `chicode-psi.vercel.app` 이었으나 2026-08-20 `chico-edu.vercel.app` 로 옮기고
Firebase 승인 도메인·Vercel 도메인 연결 둘 다 정리함.)
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

## Python numpy/pandas/matplotlib 추가 (완료)

기술 검토(용량 실측, matplotlib만 결과창 작업이 더 필요한 이유)까지만 끝나있던
상태였는데 실제로 붙였다. `feature/python-numpy-pandas-matplotlib` 브랜치에서
구현해 `main`에 merge·push 완료.

- Pyodide npm 패키지엔 코어 런타임만 있고 numpy 등 개별 패키지 `.whl`은 없다 —
  `pyodide-lock.json`에 이름·해시만 있고 실제 파일은 Pyodide가 배포하는
  jsdelivr CDN에서 받아야 한다. "외부 CDN 의존 금지" 원칙대로, 학생이 실습을
  실행하는 시점이 아니라 `postinstall` 시점에 미리 받아 `public/pyodide`에
  자체 호스팅해 둔다 (`web/scripts/sync-pyodide-packages.mjs`, 신규).
- 의존성은 하드코딩하지 않고 `pyodide-lock.json`의 `depends`를 따라가며 자동
  계산한다(지금 기준 13개 파일, 총 30MB — 코어 13MB + 패키지 17MB로 사전 추정치
  16.6MB와 거의 일치). 파일마다 sha256 검증하고 이미 받았으면 다시 안 받는다.
- `pyodide.worker.ts`의 `loadPackagesFromImports(code)` 호출은 이미 있었으므로
  (조용히 실패하던 것) 파일만 채우면 코드 변경 없이 바로 동작했다.
- **matplotlib**: 워커 안엔 화면이 없어 `plt.show()`가 기본 인터랙티브 백엔드를
  고르면 깨진다 — `loadPyodide`의 `env` 옵션으로 `MPLBACKEND=Agg`를 미리 박아둠.
  실행이 끝나면(matplotlib이 로드됐을 때만) RUNNER의 `_chicode_collect_images()`가
  열린 figure를 전부 PNG(base64)로 저장하고 `plt.close('all')`로 정리한 뒤 워커
  메시지(`type: 'image'`)로 보낸다. 결과창은 그 목록을 `<img>`로 렌더링
  (`usePython.ts`의 `images` 상태, `PythonLab.tsx`).
- 브라우저로 직접 확인: numpy 합계·pandas DataFrame 출력·matplotlib 그래프
  이미지까지 정상. 재실행해도 이전 이미지 안 남고, 두 번째 실행부턴 "already
  loaded"로 재다운로드 없이 몇 ms 안에 끝남. matplotlib 안 쓰는 기존 예제는
  영향 없음.
- 버전 고정 주의는 여전히 유효: numpy/pandas/matplotlib wheel은 현재 Pyodide
  버전(`web/node_modules/pyodide` package.json)에 정확히 맞춰야 한다 — Pyodide
  버전이 올라가면 `sync-pyodide-packages.mjs`가 알아서 새 버전에 맞는 파일을
  받아오지만(하드코딩 안 함), 기존에 받아둔 옛 버전 파일이 `public/pyodide`에
  남아있다면 정리가 필요할 수 있다.

## 수업자료 과목별 탭 + 핀번호 잠금 (완료)

`수업자료_과목별_핀잠금_구현_계획.md`에 설계, `feature/materials-subject-pin-lock`
브랜치에서 구현되어 `main`에 merge·push 완료(`63c3f07`). 다른 세션이 작업하는 동안
이쪽 세션은 대기했다 — 같은 로컬 저장소를 동시에 건드리지 않기 위해서였다.

- `/materials` = 과목 선택(`Materials.tsx`), `/materials/:subjectId` = 핀 입력 +
  자료 목록(`SubjectMaterials.tsx`, 신규). 과목 데이터는 `lib/subjects.ts`.
- `materials`에 `subjectId` 필드 추가, `listMaterials(subjectId?)`로 필터 지원
  (`where` 절 + 클라이언트 정렬 — Firestore 복합 색인을 피하려고 정렬은 코드에서 함).
- 교사 페이지(`Teacher.tsx`)에 과목 탭 추가 — 과목별 업로드/목록 + 과목 설정
  (이름·핀·노션 링크 수정).
- `firestore.rules`에 `subjects/{subjectId}` 규칙 추가 (`read: true`, 쓰기는 `isTeacher()`).
- **의도적으로 가벼운 잠금이다.** Firestore `read: true`는 유지 — 개발자도구로
  핀 값 자체도 볼 수 있는 걸 알고 받아들인 트레이드오프. "진짜" 서버 검증이 필요해지면
  Blaze 유료 플랜 + Cloud Function이 필요하다는 것도 계획 문서에 명시되어 있다.
  **이 트레이드오프를 다음 세션이 몰래 "강화"하려고 하지 말 것** — 사용자가
  의도적으로 정한 범위다.
- `subjects/information`, `subjects/ai-basics` 문서는 Firebase 콘솔에서 수동 생성해야
  한다(계획 문서 9절). 아직 안 했다면 교사 페이지에 "등록된 과목이 없습니다" 안내가 뜬다.
- typecheck·build 는 확인했지만, 이 세션은 브라우저로 직접 눌러보며 검증하지는
  못했다(다른 세션의 작업물이라 손대지 않았음) — 다음 세션이 실제 핀 입력 플로우를
  한 번 확인해두면 좋다.

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
