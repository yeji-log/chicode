# chicode web

교사와 학생이 브라우저에서 수업자료를 보고 Python·C 코드를 실습하는 교육 플랫폼.

Pico 2 W 시뮬레이터는 별도 트랙으로 미뤘다(`../chicode_개발_전략_및_단계별_계획.md` 9~14단계).
저장소 루트의 `CLAUDE.md` 에 프로젝트 전체 맥락과 다음 계획이 정리되어 있다 — 세션을
이어서 작업한다면 이 README 보다 먼저 그 문서를 읽을 것.

## 실행

```bash
npm install
npm run dev
```

`npm install` 시 `postinstall` 이 두 런타임을 자동으로 받는다 (git에는 올리지 않는다):

- Pyodide (약 13MB) → `public/pyodide/`
- clang 툴체인 (약 51MB) → `public/clang/`

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`dist/`, Vercel 용) |
| `npm run build:pages` | GitHub Pages 용 빌드 (base `/chicode/`) |
| `npm run lint` | oxlint |
| `npm run sync:pyodide` | Pyodide 런타임 재복사 |
| `npm run sync:clang` | clang 툴체인 재복사 |

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 브랜드 메인 |
| `/materials` | 수업자료 목록·뷰어·다운로드 (학생) |
| `/practice` | 실습 선택 (Python / C / Pico) |
| `/practice/python` | Python 에디터 + 실행 결과 |
| `/practice/c` | C 에디터 + 컴파일·실행 결과 |
| `/practice/pico` | 준비 중 안내 (ComingSoon) |
| `/projects`, `/lab` | 준비 중 안내 (ComingSoon) |
| `/teacher` | 자료 업로드·삭제 (Google 로그인 + 허용 계정 확인) |

풋터에 개인정보처리방침·이용약관 팝업이 있다 (`src/content/PrivacyPolicy.tsx`,
`TermsOfService.tsx`). 실제 데이터 처리 방식(Firebase Auth가 어떤 정보를 받는지,
쿠키를 안 쓰는지 등)을 코드에서 직접 확인한 뒤 작성했다.

## Python 실행 방식

Python은 **학생 브라우저 안에서** 돈다. Pyodide(WebAssembly로 컴파일된 CPython)를 쓰므로
서버는 정적 파일만 내려주고, 실행 횟수가 늘어도 서버 비용이 생기지 않는다.

- 실행은 Web Worker 안에서 한다 → 무한 루프가 화면을 얼리지 않고, **중지** 버튼으로 끊을 수 있다.
- `input()` 은 왼쪽 아래 **입력값** 칸의 줄을 위에서부터 읽는다.
- 오류는 Python 쪽에서 트레이스백을 다듬어 학생 코드의 줄 번호와 해당 줄만 보여준다.
- 표준 라이브러리는 모두 쓸 수 있다. numpy 같은 외부 패키지는 코어 런타임만 로컬에 두었으므로
  지금은 `ImportError` 가 난다 — 검토는 끝났고 구현은 안 했다. `CLAUDE.md` 의
  "검토했지만 아직 안 만든 것" 참고 (필요 용량, 왜 matplotlib만 결과창 작업이 더 필요한지 등).

관련 파일: `src/python/pyodide.worker.ts`, `src/python/usePython.ts`, `src/python/examples.ts`

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

## 배포

**Vercel**(메인, `chicode-psi.vercel.app`)과 **GitHub Pages**(보조,
`yeji-log.github.io/chicode`) 둘 다 쓴다. `main` 에 push 하면 둘 다 자동 배포된다.

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

`../수업자료_과목별_핀잠금_구현_계획.md` — 수업자료를 과목별(정보/인공지능 기초)로
나누고 핀번호로 가볍게 잠근다. 의도적으로 서버 검증 없는 가벼운 잠금이다(Firestore
`read: true` 유지). 상세 설계와 트레이드오프는 그 문서에 있다.

그 외 검토만 하고 구현 안 한 것은 `CLAUDE.md` 참고 (numpy/pandas/matplotlib).

## 참고

- PDF는 PDF.js 로 직접 캔버스에 그린다 (`src/components/PdfViewer.tsx`). 브라우저 내장 뷰어에
  맡겼더니 blob 주소로 만든 PDF 를 렌더링하지 않아 화면이 비어버렸다.
- pdf.js 6 은 `render()` 에 `canvas` 가 필수다. 예전 방식대로 `canvasContext` 만 넘기면
  오류 없이 렌더가 끝나지 않는다.
- `.npmrc` 는 npm 캐시 경로를 지정한다 (`~/.npm` 안에 root 소유 폴더가 섞여 설치가 실패했다).
  `sudo chown -R $(id -u):$(id -g) ~/.npm` 으로 원인을 고치면 지워도 된다.
