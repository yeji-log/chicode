# chicode web

교사와 학생이 브라우저에서 수업자료를 보고 Python을 실습하는 교육 플랫폼.

MVP 범위는 **수업자료 + Python 실습**까지다. Pico 2 W 시뮬레이터는 별도 트랙으로 미뤘다
(`../chicode_개발_전략_및_단계별_계획.md` 9~14단계).

## 실행

```bash
npm install
npm run dev
```

`npm install` 시 `postinstall` 이 Pyodide 런타임을 `public/pyodide/` 로 복사한다
(약 13MB, git에는 올리지 않는다).

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`dist/`) |
| `npm run lint` | oxlint |
| `npm run sync:pyodide` | Pyodide 런타임 재복사 |

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 브랜드 메인 — 각 탭으로 이동 |
| `/materials` | 수업자료 목록·뷰어·다운로드 (학생) |
| `/python` | Python 에디터 + 실행 결과 |
| `/teacher` | 자료 업로드·삭제 (**아직 인증 없음**) |

## Python 실행 방식

Python은 **학생 브라우저 안에서** 돈다. Pyodide(WebAssembly로 컴파일된 CPython)를 쓰므로
서버는 정적 파일만 내려주고, 실행 횟수가 늘어도 서버 비용이 생기지 않는다.

- 실행은 Web Worker 안에서 한다 → 무한 루프가 화면을 얼리지 않고, **중지** 버튼으로 끊을 수 있다.
- `input()` 은 왼쪽 아래 **입력값** 칸의 줄을 위에서부터 읽는다. 프롬프트와 입력값을 한 줄로
  함께 출력해 실제 실행 화면처럼 보이게 했다.
- 오류는 Python 쪽에서 트레이스백을 다듬어 학생 코드의 줄 번호와 해당 줄만 보여준다.
- 표준 라이브러리는 모두 쓸 수 있다. numpy 같은 외부 패키지는 코어 런타임만 로컬에 두었으므로
  지금은 `ImportError` 가 난다. 필요해지면 해당 패키지 파일을 `public/pyodide/` 에 추가하면 된다.

관련 파일: `src/python/pyodide.worker.ts`, `src/python/usePython.ts`, `src/python/examples.ts`

## 교사 인증 (Firebase)

Google 로그인에 성공했다고 교사가 되는 것이 아니다. Firestore `teachers` 컬렉션에
해당 이메일 문서가 있어야 교사로 인정한다.

```
Google 로그인 → Firestore teachers/{이메일} 존재? → 교사 페이지 / 접근 거부
```

**핵심은 이 확인이 브라우저에서만 이뤄지지 않는다는 점이다.** `firestore.rules` 와
`storage.rules` 가 구글 서버에서 같은 검사를 하므로, 프론트엔드 코드를 고쳐 화면을
열어도 자료를 쓰거나 지울 수 없다. 브라우저 쪽 확인은 화면을 그리기 위한 것일 뿐이다.

교사 추가/삭제는 Firebase 콘솔의 Firestore 에서 직접 한다 (규칙이 클라이언트 쓰기를 막는다).

설정값은 `.env.local` 에 둔다 (`.env.example` 참고). 이 값들은 비밀이 아니며 빌드되면
브라우저에 노출된다 — 실제 통제는 위의 보안 규칙이 담당한다.

## 배포

호스팅은 **GitHub Pages 한 곳**만 쓴다. `main` 에 push 하면 GitHub Actions 가 빌드해서
<https://yeji-log.github.io/chicode/> 에 올린다 (`.github/workflows/deploy-pages.yml`).

Firebase 는 인증·데이터·파일 저장만 담당한다. 호스팅은 쓰지 않으므로 `firebase.json` 에
hosting 항목을 두지 않았다 — 실수로 `firebase deploy` 를 쳐서 두 번째 사이트가 생기는 것을 막는다.

보안 규칙을 고쳤을 때만 이렇게 반영한다:

```bash
npx firebase login      # 최초 1회, Google 계정 인증
npx firebase deploy --only firestore:rules,storage
```

Pages 는 `/chicode/` 하위 경로라 `npm run build:pages` 로 빌드한다 (base 경로 + SPA 404 폴백).
로컬 확인이나 다른 호스팅에는 `npm run build` 를 쓴다.

## 아직 없는 것 (다음 단계)

1. **서버 저장** — 자료는 현재 브라우저 IndexedDB에만 있다. 교사가 올려도 학생 기기에는
   보이지 않는다. Firestore + Storage 로 옮겨야 실제 수업에 쓸 수 있다.
   손댈 곳은 `src/lib/materials.ts` 하나다 — 화면 코드는 이 파일의 함수만 호출한다.
2. **학생 식별** — 회원가입은 없지만, 나중에 과제·자동채점을 붙이려면 수업 참여 코드 같은
   최소한의 식별이 필요하다.

## 참고

- PDF는 브라우저 내장 뷰어(`<iframe>`)로 연다. 데스크톱 브라우저에서는 문제없지만 일부
  모바일 브라우저는 iframe 안에서 PDF를 열지 못한다. 모든 환경에서 보장하려면 PDF.js가 필요하다.
- `.npmrc` 는 npm 캐시 경로를 지정한다 (`~/.npm` 안에 root 소유 폴더가 섞여 설치가 실패했다).
  `sudo chown -R $(id -u):$(id -g) ~/.npm` 으로 원인을 고치면 지워도 된다.
