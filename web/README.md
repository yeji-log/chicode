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

## 아직 없는 것 (다음 단계)

1. **교사 인증** — Firebase Google 로그인 + 허용 계정 확인. 지금 `/teacher` 는 누구나 들어간다.
2. **서버 저장** — 자료는 현재 브라우저 IndexedDB에만 있다. 다른 기기에서는 보이지 않는다.
   전환할 때 손댈 곳은 `src/lib/materials.ts` 하나다. 화면 코드는 이 파일의 함수만 호출한다.
3. **학생 식별** — 회원가입은 없지만, 나중에 과제·자동채점을 붙이려면 수업 참여 코드 같은
   최소한의 식별이 필요하다.

## 참고

- PDF는 브라우저 내장 뷰어(`<iframe>`)로 연다. 데스크톱 브라우저에서는 문제없지만 일부
  모바일 브라우저는 iframe 안에서 PDF를 열지 못한다. 모든 환경에서 보장하려면 PDF.js가 필요하다.
- `.npmrc` 는 npm 캐시 경로를 지정한다 (`~/.npm` 안에 root 소유 폴더가 섞여 설치가 실패했다).
  `sudo chown -R $(id -u):$(id -g) ~/.npm` 으로 원인을 고치면 지워도 된다.
