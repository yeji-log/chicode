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
  1차 설계 문서. **이미 구현되어 배포됨.** MicroPython엔 `machine`(GPIO) 모듈이 원래
  없다는 것, `time.sleep()`이 진짜로 블로킹이라 실시간 버튼 상호작용을 막는다는
  것, 그 해결책(JS async 함수를 Python에서 `await`)까지 전부 실제로 설치해서
  검증한 과정이 담겨 있다 — 세부는 `web/src/pico/`를 믿을 것.
  **부품 목록은 낡았다**(7절 기준 5종) — 그 뒤 아래 센서 확장 문서로 크게 늘었다.
- `pico_센서_확장_구현_계획.md` — 부품을 5종에서 18종으로 늘린 2차 설계 문서.
  ADC → PWM → 디지털 전용 → 별도 모듈 순서와 그 근거가 적혀 있다.
  **1~4단계 전부 구현·배포됨.**
  (문서에 "위험"으로 적힌 초음파는 실제로 풀렸다. 아래 절 참고.)
- `수업자료_과목별_핀잠금_구현_계획.md` — 아래 "과목별 탭 + 핀번호 잠금" 기능의 설계
  문서. **이미 구현되어 배포됨** (`main`, 커밋 `63c3f07`). 문서와 실제 코드가 다를 수
  있으니 트레이드오프(가벼운 잠금)의 "왜"만 여기서 확인하고, 세부는 코드를 믿을 것.

## 지금까지 만든 것 (동작 확인됨)

| 기능 | 위치 | 비고 |
|---|---|---|
| 홈 화면 | `/` | 히어로 배경(hero-desk.webp, 알파 페이드), Jua 폰트 |
| 수업자료 — 과목 선택 | `/materials` | 과목 카드(정보 / 인공지능 기초) 목록. `web/src/lib/subjects.ts` |
| 수업자료 — 과목별 자료 | `/materials/:subjectId` | 핀번호 입력 후 열람. `web/src/pages/SubjectMaterials.tsx`. 아래 "과목별 핀잠금" 참고 |
| 실습 선택 | `/practice` | Python / C언어 / Pico 카드 |
| Python 실습 | `/practice/python` | Pyodide(WASM CPython), Web Worker, 무한루프 중지 가능. numpy/pandas/matplotlib 사용 가능(matplotlib은 결과창에 이미지로). 보관함·공유 있음(아래 "실습 코드 보관함·공유") |
| C 실습 | `/practice/c` | **진짜 clang을 브라우저에서 실행**. 아래 "C 실습 구조" 참고. 보관함·공유 있음 |
| Pico 2 W 실습 | `/practice/pico` | **회로 / 코드 탭 전환**(`PicoLab.tsx`, 콘솔은 코드 탭 안). 부품 28종 + 되돌리기 + 부저 실제 소리. 아래 "Pico 시뮬레이터 확장" 참고. `PicoGate.tsx`가 교사/학생(설정 공개 여부)로 게이트. Monaco는 진입 시 동적 로드. 보관함·공유는 코드+회로를 함께 담는다 |
| Lab (활동/발표) | `/lab` | 핀 게이트(`LabGate.tsx`) 아래 홈·로드맵(시즌 카드)·활동 목록·활동 상세. `/materials/:subjectId`에도 로드맵·활동 화면이 과목별로 재마운트됨(`useLabScope`). 교사용 보드 에디터는 `LabBoardEditor.tsx` |
| 시간표 / 수업기록 | `/timetable` | 그리드(`TimetableBoard`)와 반별 수업기록(`ClassRecords.tsx`, 반 탭 드래그 정렬·학생 참여 기록·메모)을 탭 전환 |
| 뉴스 | `/news` | 홈 히어로 "오늘의 AI·IT 이슈" 버튼에서 진입하는 공개 페이지. 교사는 `/teacher`의 뉴스 탭(`TeacherNews.tsx`)에서 후보 관리 |
| 연습문제 | `/exercises` | 문제를 풀고 브라우저에서 바로 채점(`Exercises.tsx`/`ExerciseDetail.tsx`). 교사는 `/teacher`의 연습문제 탭. `/projects`는 여기로 리다이렉트("프로젝트" 탭 자리에 연습문제를 넣었다) |
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

## Pico 시뮬레이터 확장 (2026-08-25, 1·2단계 완료 / 3단계 진행 중)

설계는 `pico_센서_확장_구현_계획.md`, 세부는 커밋 로그를 믿을 것. 요약만 적는다.

**화면 구조가 바뀌었다.** 코드와 회로가 좌우 2단이었는데 탭 전환으로 바꿨다. 나란히
두면 회로가 가로 절반밖에 못 쓰는데, 그렇다고 아래로 내려도 소용이 없었다 — SVG
viewBox가 900×640 고정이라 `preserveAspectRatio` 기본값 때문에 배율이 세로에 묶여서,
컨테이너를 730→974px로 넓혀도 Pico 보드는 226px 그대로였다(실측). viewBox 가로를
캔버스 비율에 맞춰 늘리는 것까지 같이 고쳐야 넓힌 만큼 작업 공간이 된다.
콘솔은 코드 탭 안에 있고, 회로 탭에선 탭바 오른쪽에 마지막 한 줄만 뜬다(오류면 빨갛게,
누르면 코드 탭으로). 예제가 `print()`를 안 써서 회로를 볼 때 콘솔이 보여줄 건 오류뿐인데
그것 때문에 220px를 상시로 깔면 회로 탭이 한 화면에 안 들어가서다.

**런타임에 클래스를 더했다.** `machine` 모듈은 이 MicroPython WASM 빌드에 원래 없어서
Python 소스로 만들어 `sys.modules`에 꽂는데(1차 문서 참고), 거기 `Pin` 하나뿐이었다.
`ADC`(GP26~28만 허용 — 진짜 Pico가 그러니까)와 `PWM`(freq/duty_u16/duty_ns/deinit)을
추가했다. **여기 상수를 새로 둘 땐 이름을 `_chico_`로 시작해야 한다** —
`RESET_GLOBALS_SOURCE`가 매 실행 전에 그렇지 않은 전역을 전부 지워서, 첫 실행은
멀쩡하고 두 번째부터 `NameError`가 난다(실제로 밟았다).

**부품 28종.**
출력 = LED(PWM이면 밝기, 알 색 5종 중 선택), RGB LED(PWM이면 색 혼합), 부저(Web Audio로
실제 소리 + 음소거), 서보, DC 모터, 스텝모터, 릴레이, 진동모터, 신호등, 7세그먼트,
네오픽셀 8칸, I2C LCD 1602, OLED SSD1306.
입력 = 버튼, 스위치, 틸트, 리드, IR 장애물, 조이스틱(ADC 2축 + 버튼),
가변저항·조도·토양수분·빗물·불꽃·아날로그온도(ADC 슬라이더), 온습도·초음파·PIR.

**슬라이더 하나로 ADC 값을 만드는 센서는 `ANALOG_SENSORS` 표에 한 줄 추가하면 끝난다**
— 글리프도 그 표를 읽는 것 하나뿐이다. 부품마다 같은 코드를 복사하지 말 것.

**부품에 조작부를 넣을 땐 몸통(끄는 자리)과 조작부(누르는 자리)를 반드시 분리할 것** —
조작부가 몸통을 덮으면 `stopPropagation` 때문에 부품을 아예 못 옮기게 된다(PIR·틸트·
리드에서 실제로 났다).

**부품 도형과 핀 좌표는 "원래 크기"로 적고, 화면에 낼 때만 `COMPONENT_SCALE`(지금
1.5)을 곱한다.** 부품마다 좌표를 손대면 도형과 핀이 어긋난다 — 상수 하나만 바꾸면
전 부품이 같이 커진다. 핀 좌표 계산(`pinPoint`)과 SVG transform 이 같은 순서
(배율 → 반전 → 회전)를 지켜야 전선이 화면에 보이는 핀에 붙는다.

**조작부가 둘 이상인 부품(온습도, PIR)이 있어서 아날로그 값은 "부품 id + 채널"
(`analogKey`)로 저장한다.** 포인터를 부품 기준 좌표로 되돌리는 건 `toComponentLocal`
한 군데뿐이니 새 조작부는 그걸 쓸 것.

**캔버스 조작.** 전선을 클릭하면 선택되고 양 끝 손잡이로 다른 핀에 옮길 수 있다
(전선 클릭=즉시삭제는 없어졌다. 삭제는 Delete/휴지통, 오른쪽 클릭은 색 바꾸기).
되돌리기는 ⌘/Ctrl+Z, 다시 실행은 ⌘/Ctrl+Shift+Z, 캔버스 왼쪽 아래에 버튼도 있다.
팔레트는 부품 목록만 스크롤하고 전선 색·음소거·삭제는 아래 고정이다 — 높이는 팔레트가
아니라 **행(부모)** 에 걸어야 한다. 캔버스에만 걸면 팔레트 내용 높이가 행을 밀어올려
사이드바가 캔버스보다 길어진다(실제로 664px vs 522px가 났다).

**시간 관련 — 다음 세션이 꼭 알아야 할 것.** `ticks_us/ticks_ms/ticks_diff`를
`performance.now()` 기반 JS 시계로 갈아끼워 두었다(`INSTALL_PRECISE_TICKS_SOURCE`).
MicroPython 자체 시계가 1000us 단위로만 움직여서(실측) 마이크로초를 재는 코드가
성립하지 않았기 때문이다 — 거리로 치면 해상도가 17cm 였다. 지금은 100us(1.7cm).
**이걸 "왜 여기만 시계를 손댔지" 하고 되돌리면 초음파가 깨진다.**

**초음파는 값이 아니라 펄스로 만든다.** 워커가 trig 핀의 1→0 내림 edge 를 보고 echo
창(시작·끝 시각)을 잡아두고, echo 핀 읽기는 "지금이 그 창 안인가"로 답한다. 어느 핀이
trig/echo 인지는 워커가 알 수 없으므로(배선은 UI가 안다) UI가 센서 목록을 통째로
보낸다. `machine.time_pulse_us`도 같이 만들어 뒀다(실물에 있는 함수, 타임아웃 포함).

**전선은 전원 레일의 구멍마다 따로 꽂힌다.** 레일 `PinRef`에 `col`이 있고, 전기적으로
같은 레일이면 `connectivity`에서 가상 노드 하나로 묶는다. 이게 없으면 같은 레일에
꽂은 선끼리 안 이어진 것으로 계산된다.

**OLED 는 framebuf 를 쓴다.** 이 MicroPython 빌드에 `framebuf` 가 이미 들어 있어서
(확인함) 실물 `ssd1306` 드라이버를 거의 그대로 쓴다 — `text()` 가 진짜 폰트로 그려지고
`show()` 가 그 버퍼를 I2C 로 흘려보내면 워커가 SSD1306 규약(0x40=데이터, 0x21/0x22=
주소 지정, 한 바이트가 세로 8픽셀)대로 푼다. 명령은 드라이버가 한 바이트씩 따로 보내니
메시지를 넘어가며 인자를 기다려야 한다.

**I2C LCD 는 진짜 프로토콜을 해석한다.** `machine.I2C.writeto()` 로 나가는 바이트를
워커가 PCF8574 백팩 규약(니블 두 번, E 의 내림 edge, RS 비트)대로 풀어 HD44780
명령·글자로 바꾼다 — 드라이버를 쓰든 직접 바이트를 쓰든 같은 화면이 나온다.
드라이버(`pico_i2c_lcd`)는 실물 수업에서 파일로 올리는 그것을 미리 넣어둔 모듈로 준다.

**계획 문서의 1~4단계가 전부 끝났다.** 부품을 더 늘린다면 그 문서의 "공통 설계 결정"
절을 먼저 읽을 것.

**보드 내장 LED 는 `machine.Pin("LED")` 로 연다.** 진짜 Pico 2 W 도 이 LED 는 GPIO 가
아니라 무선 칩(CYW43)에 달려 있어 GP 번호가 없다. **`Pin(25)` 는 일부러 안 받는다** —
무선 없는 옛날 Pico 는 GP25 가 내장 LED 라 교재·인터넷 예제가 그렇게 되어 있는 게 많은데,
받아주면 시뮬레이터에서만 되고 실물에서는 안 도는 코드를 가르치게 된다(ADC 를 GP26~28 로
묶어둔 것과 같은 이유). 대신 GP25 에 쓰면 콘솔에 한 번 안내가 뜬다. 다음 세션이 이걸
"친절하게" 열어주려 하지 말 것. PWM(밝기 조절)도 실물처럼 막혀 있다. 워커↔UI 사이
GPIO 메시지가 전부 숫자 하나라 내장 LED 에는 실제 핀과 안 겹치는 음수를 배정했다
(`board.ts` 의 `ONBOARD_LED_PIN`).

**캔버스 조작 단축키**: R 또는 ㄱ(회전), M 또는 ㅡ(좌우 반전), Delete(삭제),
⌘/Ctrl+Z(되돌리기). 한글 자판 상태에서 r 은 'ㄱ', m 은 'ㅡ'로 들어오는데 학생 컴퓨터는
한영 상태가 제각각이라 둘 다 받는다.

**검증 안 된 것**: 아이패드(터치). 조작부(렌즈 돔, 유리관, 슬라이더 손잡이, 노브,
전선 끝 손잡이 r=7)가 전부 마우스 기준이라 손가락으로 눌러본 적이 없다. 부품이 18종이
되면서 눌러볼 곳이 처음보다 훨씬 늘었다.

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
- **과목을 콘솔에서 손으로 만들던 시절은 지났다.** 계획 문서 9절과 `subjects.ts`
  머리말에는 "Firebase 콘솔에서 최초 1회 생성" 이라고 적혀 있지만, 그 뒤 교사 페이지에
  "+ 새 과목" 버튼(`createSubject`)이 생겨서 화면에서 만든다. 2026-08-26 기준 실제
  등록된 과목은 `information`(정보, 준비중) · `ai-basics`(인공지능 기초, 공개) ·
  UUID 하나(인공지능 기초(3학년), 준비중) 세 개다.
- **학생 입장 핀 흐름은 2026-08-26 에 브라우저로 전부 검증했다** — 준비중 과목은 카드가
  링크가 아니고 URL 로 직접 들어와도 막힌다, 틀린 핀 안내, 5회 실패 시 30초 잠금과 자동
  해제, 맞는 핀으로 입장, 새로고침해도 유지(sessionStorage), 세션을 비우면 다시 잠김,
  Enter 키 제출까지. 교사용 핀 배지는 학생 화면에 안 뜬다.
- **로그인 없이 Firestore 데이터를 확인할 수 있다.** `subjects`/`materials` 는 규칙상
  읽기가 공개라, REST 로 그냥 GET 하면 지금 무엇이 들어 있는지 볼 수 있다 —
  `https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/subjects`
  (projectId 는 `web/.env.local`). 화면에 안 나오는 데이터를 의심할 때 제일 빠른 길이다.
  실제로 이 방법으로 `subjectId` 가 없어서 학생·교사 어느 화면에도 안 잡히던 자료 1건을
  찾아냈다(2026-08-26 에 콘솔에서 삭제 — 쓰기는 `isTeacher()` 라 REST 로는 못 지운다).

## 실습 코드 보관함·공유 (2026-08-31, 완료)

설계는 `학생_작업물_저장_공유_구현_계획.md`, 세부는 `web/src/practice/` 를 믿을 것.
세 실습(Python·C·Pico) 헤더의 "예제 불러오기" 옆에 **보관함**·**공유** 버튼을 붙였다.

- **보관함** — 지금 코드(Pico 는 회로까지)를 이름 붙여 여러 벌 `localStorage` 에
  저장/불러오기/이름변경/삭제. 20개 상한, 용량 초과 시 오래된 것부터 밀어낸다
  (`draftStore.ts`). 계정 동기화는 학생 로그인이 없어 구조상 불가능 —
  `exercises.ts` 가 풀이 기록을 서버에 안 남긴 것과 같은 이유.
- **공유** — 코드(+회로)를 `deflate-raw`+base64url 로 압축해 `#s=` 해시에 통째로
  싣는다(`shareLink.ts`). 서버에 아무것도 안 올라가고, 해시라 액세스 로그에도 안
  남는다. Firestore 로 안 한 이유: `firestore.rules` 가 학생 쓰기를 전부 막고,
  열면 무료 플랜 할당량이 스팸에 노출된다(수업자료 핀과 같은 판단).
  - 형식: `버전(1) + 인코딩(z=deflate / r=raw) + payload`. 둘 다 만들어 짧은 쪽을
    쓴다. 버전은 엔벨로프가 바뀌면 올린다 — 옛 링크를 잘못 읽지 않게.
  - 실측: 7세그먼트 회로 예제가 URL 912자, 부품 15개짜리 무거운 회로도 압축 후
    ~1.2KB. 8000자 소프트 상한은 사실상 여유.
  - `CompressionStream` 이 없으면(구형 사파리) 자동으로 raw 로 떨어진다.
- **링크를 열면** 헤더 아래 배너로 확인받는다 — "불러올까요? 지금 코드는 보관함에
  '불러오기 전 코드'로 저장됩니다". 종류가 안 맞으면(Python 링크를 C 화면에서)
  올바른 실습으로 가는 링크를 토큰째로 보여준다.
- 파싱은 `JSON.parse` + 스키마 검증만. 불러온 코드는 자동 실행 안 함(예제
  불러오기와 같다).
- 회로를 뽑아오려고 `CircuitCanvasHandle` 에 `getSnapshot()` 을 더했다.
- 토스트(`components/Toast.tsx`, `App.tsx` 에 `ToastHost` 한 번) — `alert()` 는
  일부 아이패드 웹뷰에서 조용히 무시돼서(회로 캔버스 `confirm` 주석과 같은 이유).
- **다음 단계**(계획 문서 13절): 교사용 "제출 링크 모으기" — 이 공유 링크를
  붙여넣으면 목록으로 쌓이는 화면. 이 위에 얹으면 된다.

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
