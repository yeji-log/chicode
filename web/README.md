# chicode web

교사와 학생이 브라우저에서 수업자료를 보고 Python·C·Pico 2 W(MicroPython) 코드를
실습하는 교육 플랫폼.

저장소 루트의 `CLAUDE.md` 에 프로젝트 전체 맥락과 다음 계획이 정리되어 있다 — 세션을
이어서 작업한다면 이 README 보다 먼저 그 문서를 읽을 것.

## 실행

```bash
npm install
npm run dev
```

`npm install` 시 `postinstall` 이 브라우저에서 돌아가는 런타임들을 자동으로 받는다
(git에는 올리지 않는다 — 전부 `public/` 아래, `.gitignore` 처리됨):

- Pyodide 코어 (약 13MB) + numpy/pandas/matplotlib 등 (약 17MB) → `public/pyodide/`
- clang 툴체인 (약 51MB) → `public/clang/`
- MicroPython WebAssembly (약 450KB) → `public/micropython/`
- pdf.js CMap·표준 폰트 데이터 → `public/pdfjs/`

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`dist/`, Vercel 용) |
| `npm run build:pages` | GitHub Pages 용 빌드 (base `/chicode/`) |
| `npm run lint` | oxlint |
| `npm run sync:pyodide` | Pyodide 코어 런타임 재복사 |
| `npm run sync:pyodide-packages` | numpy/pandas/matplotlib 등 wheel 재다운로드 |
| `npm run sync:clang` | clang 툴체인 재복사 |
| `npm run sync:micropython` | MicroPython 런타임 재복사 |
| `npm run sync:pdfjs-assets` | pdf.js CMap·폰트 데이터 재복사 |

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 브랜드 메인 |
| `/news` | 오늘의 AI·IT 이슈 (학생) |
| `/materials` | 수업자료 과목 선택 (학생) |
| `/materials/:subjectId` | 핀번호 입력 후 과목별 수업목차·OT·자료 열람 |
| `/practice` | 실습 선택 (Python / C / Pico) |
| `/practice/python` | Python 에디터 + 실행 결과 (numpy/pandas/matplotlib 포함) |
| `/practice/c` | C 에디터 + 컴파일·실행 결과 |
| `/practice/pico` | Pico 2 W 시뮬레이터 — 회로 캔버스 + MicroPython 에디터. 교사는 항상, 학생은 공개 설정이 켜져야 들어감 |
| `/exercises` | 연습문제 — 브라우저에서 바로 채점 (`/projects` 는 여기로 리다이렉트) |
| `/lab` | 핀 게이트 뒤 활동(시즌 로드맵·활동 목록·상세). 교사용 보드 에디터도 포함 |
| `/timetable` | 시간표 그리드 + 반별 수업기록 |
| `/teacher` | 자료 업로드·삭제 + Lab/뉴스/과목 관리 (Google 로그인 + 허용 계정 확인) |

세 실습(python/c/pico) 모두 헤더에 **보관함**(코드·회로를 이름 붙여 여러 벌
localStorage 저장)과 **공유**(코드·회로를 통째로 담은 `#s=` 링크 생성) 버튼이 있다.
서버를 안 쓴다 — `src/practice/`, `CLAUDE.md` 의 "실습 코드 보관함·공유" 절 참고.

풋터에 개인정보처리방침·이용약관 팝업이 있다 (`src/content/PrivacyPolicy.tsx`,
`TermsOfService.tsx`). 실제 데이터 처리 방식(Firebase Auth가 어떤 정보를 받는지,
쿠키를 안 쓰는지 등)을 코드에서 직접 확인한 뒤 작성했다.

## Python 실행 방식

Python은 **학생 브라우저 안에서** 돈다. Pyodide(WebAssembly로 컴파일된 CPython)를 쓰므로
서버는 정적 파일만 내려주고, 실행 횟수가 늘어도 서버 비용이 생기지 않는다.

- 실행은 Web Worker 안에서 한다 → 무한 루프가 화면을 얼리지 않고, **중지** 버튼으로 끊을 수 있다.
- `input()` 은 왼쪽 아래 **입력값** 칸의 줄을 위에서부터 읽는다.
- 오류는 Python 쪽에서 트레이스백을 다듬어 학생 코드의 줄 번호와 해당 줄만 보여준다.
- 표준 라이브러리는 물론 numpy, pandas, matplotlib 도 쓸 수 있다. 코어 런타임만 번들에
  들어있고 이 패키지들은 `postinstall` 때 `scripts/sync-pyodide-packages.mjs` 가 미리
  받아 `public/pyodide` 에 자체 호스팅해 둔다(CDN 요청 없음). 처음 import 할 때 워커가
  그 파일을 불러오느라 몇 초 걸릴 수 있고, 그 다음부턴 캐시돼서 빠르다.
  matplotlib 그래프는 `plt.show()` 대신 실행이 끝나면 결과창에 이미지로 나타난다(워커
  안엔 화면이 없어 `MPLBACKEND=Agg` 로 고정하고 `plt.savefig()` 로 꺼내온다). `CLAUDE.md`
  의 "Python numpy/pandas/matplotlib 추가" 절 참고.

관련 파일: `src/python/pyodide.worker.ts`, `src/python/usePython.ts`, `src/python/examples.ts`,
`scripts/sync-pyodide-packages.mjs`

## C 실행 방식

C도 **학생 브라우저 안에서** 컴파일하고 실행한다. clang.wasm + wasm-ld.wasm
(binji/wasm-clang, LLVM 8)을 받아 컴파일 → 링크 → 실행 세 단계를 전부 처리한다.

기성 C 인터프리터(JSCPP)는 검토 후 버렸다 — `printf("A, B")` 가 `A,B` 로 나오고
(문자열 리터럴의 공백을 삼킨다) 한글은 아예 오류가 났다. 진짜 컴파일러로 갔다.

WASI는 기성 라이브러리 대신 직접 구현했다(`src/c/wasi.ts`) — 이 wasm 들이 쓰는
`wasi_unstable`(snapshot_0) ABI 는 흔히 쓰이는 `wasi_snapshot_preview1` 과 구조체
배치가 다르고, SharedArrayBuffer(→ COOP/COEP 헤더 → GitHub Pages 불가 + Google
로그인 팝업 차단)를 피하기 위해서다. Python처럼 stdin을 미리 받아두는 방식이라
블로킹 I/O가 필요 없다.

제약: C++ 미지원, 파일 하나만 작성 가능(커스텀 헤더 include 불가), 네트워크 불가,
파일이 실행마다 초기화됨. 화면에도 접이식 안내로 노출되어 있다(`SupportNote`).

관련 파일: `src/c/wasi.ts`(WASI 구현 + MemFS), `src/c/tar.ts`(sysroot 압축 해제),
`src/c/clang.worker.ts`(컴파일 파이프라인), `src/c/useC.ts`, `src/c/examples.ts`

## Pico 2 W 실행 방식

가상 Pico 2 W 보드에 회로(LED·버튼 등)를 그리고, MicroPython 코드로 그 회로를
실시간으로 제어하는 실습이다. 설계·검증 과정은 저장소 루트의
`pico2w_시뮬레이터_구현_계획.md` 에 있다 — "먼저 검증, 그다음 구현" 원칙대로
직접 설치해서 확인한 결과로 쓴 문서다.

- MicroPython을 직접 WebAssembly로 포팅하지 않는다. MicroPython 리드 메인테이너
  (dpgeorge)가 npm에 배포하는 사전 빌드 패키지
  (`@micropython/micropython-webassembly-pyscript`, 446KB)를 그대로 쓴다 —
  Pyodide·clang과 같은 패턴으로 `postinstall` 때 `public/micropython`에 복사해 둔다.
- 이 빌드엔 `machine`(GPIO) 모듈이 아예 없다 — 브라우저엔 진짜 GPIO가 없으니 당연하다.
  `registerJsModule` 공식 API로 `machine.Pin`을 직접 구현해 JS 쪽 가상 회로와 연결한다.
- **진짜 문제는 `time.sleep()`이 진짜로 블로킹이라는 것.** WASM 호출 중엔 JS 이벤트
  루프에 제어권이 전혀 안 돌아와서, 실행 중에 학생이 가상 버튼을 눌러도 반영되지
  않는다(실측 확인). 해결책: `machine`/`time` 셔임의 하드웨어 호출을 JS `async` 함수로
  만들고 Python 쪽에서 `await`로 부르면 그 순간 진짜로 이벤트 루프에 양보한다
  (`runPythonAsync`가 모듈 최상위 `await`를 지원 — 확인 완료).
- 제약: `machine.Pin`(디지털 입출력)만 지원, ADC/PWM/I2C/SPI/UART는 아직 없음. 함수
  없이 최상위(또는 `while`)에 코드를 두면 실행 중에도 버튼 반응을 볼 수 있지만, 함수로
  감싸면 실행이 끝난 뒤 결과만 보인다. 브레드보드는 10칸 + 전원 레일만 있는 축소판.
- 학생 공개는 `practiceSettings/pico2w` 문서의 `open` 필드로 켠다(`PicoGate.tsx`) —
  교사는 이 설정과 무관하게 항상 들어간다.

관련 파일: `src/pico/usePico.ts`, `src/pico/circuit/CircuitCanvas.tsx`,
`src/pages/PicoLab.tsx`, `src/pages/PicoGate.tsx`

## 교사 인증 (Firebase)

Google 로그인에 성공했다고 교사가 되는 것이 아니다. Firestore `teachers` 컬렉션에
해당 이메일 문서가 있어야 교사로 인정한다.

```
Google 로그인 → Firestore teachers/{이메일} 존재? → 교사 페이지 / 접근 거부
```

**핵심은 이 확인이 브라우저에서만 이뤄지지 않는다는 점이다.** `firestore.rules` 가
구글 서버에서 같은 검사를 하므로, 프론트엔드 코드를 고쳐 화면을 열어도 자료를 쓰거나
지울 수 없다. 브라우저 쪽 확인은 화면을 그리기 위한 것일 뿐이다.

교사 추가/삭제는 Firebase 콘솔의 Firestore 에서 직접 한다 (규칙이 클라이언트 쓰기를 막는다).

설정값은 `.env.local` 에 둔다 (`.env.example` 참고). 이 값들은 비밀이 아니며 빌드되면
브라우저에 노출된다 — 실제 통제는 위의 보안 규칙이 담당한다.

## 오늘의 AI·IT 이슈 (`/news`)

홈 화면 히어로의 "🔥 오늘의 AI·IT 이슈" 버튼(수업자료 보기 옆)을 누르면 들어가는
전용 페이지다. 처음엔 홈 화면 아래에 카드를 바로 그렸는데, 홈 화면은 짧게 유지하고
뉴스는 보고 싶을 때 들어가서 보게 해달라는 요청으로 전용 페이지로 옮겼다.

**자동 수집 + 사람 검토**로 나눈 2단계 구조다 — LLM(Claude API 등)으로 요약·중요도
판단까지 자동화하는 방법도 검토했지만, 그러면 "서버 비용 0원" 원칙이 깨지고 확인
안 된 요약이 그대로 학생에게 노출될 위험도 있어 채택하지 않았다. 대신 자동화는
후보를 추리는 것까지만 하고, 요약·"왜 중요한가"·최종 3~5개 선정은 교사가 직접 한다.

```
GitHub Actions (매일 KST 05:00, .github/workflows/daily-news.yml)
  → scripts/fetch-news.mjs 가 국내외 공식 기업 블로그·과학기술 전문 매체 RSS 수집
  → 키워드로 분야 태깅(안 맞으면 버림)
  → 영어 소스만 한글로 번역(국내 소스는 이미 한글이라 건너뜀)
  → 명백한 제외 신호 거르기(주가·루머·경품이벤트 등)
  → 같은 사건을 보도한 항목을 이슈 단위로 묶기(여러 출처를 sources 배열에)
  → 중복 제거(이번 배치 내 + 최근 14일 발행분과 대조)
  → 중요도 점수 계산(정렬용 힌트, 자동 제외 기준 아님) + 국내/해외 태그
  → Firebase Admin SDK로 newsCandidates 에 기록 (교사만 읽음)
        ↓
  교사가 /teacher → "오늘의 뉴스" 탭에서 점수 높은 순으로 후보를 보고 골라
  요약 작성 후 승인
        ↓
  newsIssues 로 이동 (읽기 공개) → /news 페이지에 카드로 노출
```

- 데이터 계층: `src/lib/news.ts`. 화면은 `src/pages/News.tsx`(학생용, `src/components/NewsCard.tsx`
  로 카드 UI를 재사용)와 `src/pages/TeacherNews.tsx`(교사 검토)만 이 파일의 함수를 호출한다.
- `newsCandidates` 는 클라이언트 write 를 항상 막아뒀다(`firestore.rules`) — Admin SDK
  는 규칙을 우회하므로 자동화는 그대로 동작하고, 이건 "가짜 후보를 브라우저에서
  써넣는 것"만 막는 용도다. 교사는 delete(건너뛰기)만 가능하다.
- **번역은 항상 한글로.** 후보는 교사가 처음 볼 때부터 한글이어야 한다는 요구사항이라,
  영어 소스는 MyMemory 무료 공개 번역 API로 자동 번역한다(가입·API 키 불필요 — DeepL
  등 키가 필요한 서비스는 "완전 무료 유지" 결정과 안 맞아 제외). 기계번역이라 완벽하진
  않지만 교사가 발행 전에 다듬는다는 전제로 초안 용도로는 충분하다.
- **RSS 소스는 실제로 curl 로 하나하나 확인한 것만 넣었다** (`scripts/fetch-news.mjs`
  상단 주석 참고). 해외: OpenAI·Google DeepMind·Google AI Blog·NVIDIA·Meta·Amazon
  Science·Hugging Face·GitHub Blog·ScienceDaily(AI). 국내: 네이버 D2·카카오·
  우아한형제들·쿠팡·토스·뱅크샐러드·LY Corp(LINE)·삼성 뉴스룸·SK hynix 뉴스룸·왓챠·
  무신사 기술블로그·하이퍼커넥트·NHN Cloud Meetup·원티드·헬로디디. Anthropic 공식
  블로그·Microsoft AI 블로그·SOCAR·컬리·LG 계열은 확인 시점에 RSS가 없거나(404) 막혀
  있거나(403/410) HTML 페이지만 나와서 뺐다 — 나중에 다시 확인해서 추가할 수 있다.
  우아한형제들·SK hynix 뉴스룸은 로컬에서는 되는데 GitHub Actions 러너에서만 403이
  나는 게 확인돼서, 소스는 남겨뒀지만 실제로는 잘 안 잡힐 수 있다.
  - 처음엔 기업 블로그 20곳뿐이었는데, 실제로 돌려보니 ai-science/robotics/it
    카테고리가 전부 0건으로 나왔다(2026-08-20 확인) — 기업 블로그 위주라 과학
    연구·로봇공학 뉴스 자체가 잘 안 올라와서다. ScienceDaily(AI)·헬로디디(대덕특구·
    카이스트·출연연 중심 과학기술 매체)를 추가하고 `ai-science` 키워드 사전을
    8개→24개로 넓혀서 해결했다.
- 분야 태깅 키워드 사전(`CATEGORY_KEYWORDS`)은 영어·한글을 함께 담고, 단어 경계를
  로마자·숫자 기준으로만 판단하는 lookaround 매칭을 쓴다 — 처음엔 정규식 `\b` 를
  썼는데 `\b` 는 한글을 "단어 문자"로 인정하지 않아 한글 키워드가 단 하나도 안
  걸리는 버그가 있었다(직접 돌려서 확인). 카테고리는 "가장 먼저 매칭된 것"이 아니라
  "가장 구체적인(긴) 키워드로 매칭된 것"을 고른다 — 안 그러면 ai 카테고리의 범용
  키워드 `'ai'`가 항상 먼저 걸려서 "AI 반도체" 같은 구체적 키워드가 있는 카테고리로
  못 간다(이것도 직접 돌려서 확인).
- 후보에는 `score`(0~100 근사 중요도, 정렬 힌트일 뿐 자동 제외 기준 아님)·
  `region`(국내/해외)·`sources`(같은 사건을 보도한 출처 전체) 필드도 함께 기록된다.
  중요도 점수는 사람이 문맥을 읽고 채점해야 하는 걸 LLM 없이 근사한 것이라 —
  키워드 등급·경과 시간·보도 소스 수·생활연결 키워드·발췌 길이로 계산한다
  (`computeScore` 참고).
- 명백한 제외 신호(주가 급등락, 루머, 경품 이벤트 등 `EXCLUDE_PATTERNS`)는 문자열
  매칭만으로 안전하게 판단 가능한 것만 걸러낸다 — 문맥이 필요한 항목(단순 기업 홍보
  등)은 오탐 위험이 더 크다고 보고 자동화하지 않았다.
- 이 워크플로가 실제로 동작하려면 **GitHub 저장소 Secret**
  `FIREBASE_SERVICE_ACCOUNT_KEY` 를 등록해야 한다. Firebase 콘솔 → 프로젝트 설정 →
  서비스 계정 → "새 비공개 키 생성" 으로 받은 JSON 파일 전체 내용을 그대로 붙여넣는다.
  firebase-admin 12+ 는 ESM에서 `admin.credential.cert()` 같은 옛 네임스페이스 API가
  안 통한다 — `firebase-admin/app`·`firebase-admin/firestore` 모듈형 API를 쓴다
  (실제로 옛 방식으로 돌려서 오류 확인 후 바꿈).
- `firestore.rules` 를 고쳤으므로 배포 전이라면 아래 "배포" 절의
  `npx firebase deploy --only firestore:rules` 를 실행해야 실제로 반영된다 — 배포 전엔
  `/news` 가 `permission-denied` 를 조용히 삼키고 빈 상태로 보인다(의도한 동작).
- 이미지(썸네일)는 없다 — 학교 네트워크가 외부 이미지를 막을 수 있어 텍스트 카드만
  쓰기로 했다. 뉴스 상세 페이지, "관련 개념/프로젝트" 연결은 아직 없다(연결할
  개념 페이지·`/projects` 콘텐츠 자체가 없어서 다음 단계로 미룸).

## 배포

**Vercel**(메인, `chico-edu.vercel.app`)과 **GitHub Pages**(보조,
`yeji-log.github.io/chicode`) 둘 다 쓴다. `main` 에 push 하면 둘 다 자동 배포된다.
(예전엔 `chicode-psi.vercel.app` 이었으나 `chico-edu.vercel.app` 로 옮기고 정리함.)

- Vercel: Root Directory 를 `web` 으로 설정해야 한다(저장소 루트엔 package.json 이 없다).
  `vercel.json` 에 SPA rewrite + 캐시 헤더가 있다. 환경변수는 Vercel 프로젝트 설정에 등록.
- GitHub Pages: `.github/workflows/deploy-pages.yml`. `/chicode/` 하위 경로라
  `npm run build:pages` 로 빌드(base 경로 + `404.html` 폴백).
- **Firebase 승인 도메인은 Vercel 쪽만 등록되어 있다.** GitHub Pages 사이트는 열리지만
  교사 로그인은 실패한다 — 의도된 상태(사용자가 Vercel 을 대표 주소로 쓰기로 정함).

보안 규칙을 고쳤을 때만 이렇게 반영한다:

```bash
npx firebase login      # 최초 1회, Google 계정 인증
npx firebase deploy --only firestore:rules
```

## 수업자료가 저장되는 곳

파일은 원래 Cloud Storage 가 맡을 일이지만, Firebase 는 새 프로젝트에서 Storage 를 쓰려면
유료(Blaze) 플랜을 요구한다. 무료(Spark)로 운영하기 위해 **Firestore 에 파일을 나눠 담는다.**

```
materials/{id}              메타데이터 (제목·파일명·크기·조각 수)
materials/{id}/chunks/{n}   파일 내용 (base64, 원본 512KB 단위)
```

Firestore 는 문서 하나가 1MiB 를 넘을 수 없어 조각을 낸다. base64 는 약 1.34배로 불어나므로
512KB → 약 683KB 가 되어 제한 안에 들어간다.

**한계를 알고 쓸 것:**

- 파일 하나당 최대 10MB
- 무료 플랜의 Firestore 총 용량은 1GiB (PDF 200개 남짓)
- 데이터베이스를 파일 저장소로 쓰는 것이므로 정공법은 아니다

Blaze 로 올려 Storage 를 쓰게 되면 `src/lib/materials.ts` 의 함수 본문만 바꾸면 된다.
화면 코드는 이 파일의 함수만 호출하므로 그대로 둔다.

> 하위 컬렉션은 보안 규칙을 상속하지 않는다. `chunks` 에 대한 규칙을 따로 적지 않으면
> 파일 본문이 무방비로 열린다 — `firestore.rules` 참고.

## 다음 계획

현재 백로그는 저장소 루트 `CLAUDE.md` 가 최신 상태를 유지한다 — 이 README 보다
자주 바뀌므로 여기엔 목록을 복제하지 않는다.

## 참고

- PDF는 PDF.js 로 직접 캔버스에 그린다 (`src/components/PdfViewer.tsx`). 브라우저 내장 뷰어에
  맡겼더니 blob 주소로 만든 PDF 를 렌더링하지 않아 화면이 비어버렸다.
- pdf.js 6 은 `render()` 에 `canvas` 가 필수다. 예전 방식대로 `canvasContext` 만 넘기면
  오류 없이 렌더가 끝나지 않는다.
- `.npmrc` 는 npm 캐시 경로를 지정한다 (`~/.npm` 안에 root 소유 폴더가 섞여 설치가 실패했다).
  `sudo chown -R $(id -u):$(id -g) ~/.npm` 으로 원인을 고치면 지워도 된다.
