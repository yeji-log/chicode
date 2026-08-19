# Pico 2 W 시뮬레이터 구현 계획

> 원본 아이디어는 `~/Downloads/chicode_pico2w_simulator_plan.md`(사용자가 준비한 초안)에서
> 왔다. 그 문서는 방향성(machine API 추상화, Wokwi 비의존, 서버 비용 0원)은 맞았지만
> "실제로 되는지"는 검증하지 않은 설계 문서였다. 이 문서는 그 초안을 코드로 옮기기 전에
> **실제로 설치하고 실행해서 확인한 결과**로 다시 쓴 버전이다. 초안과 다른 부분은 전부
> 실측 근거를 남겨둔다 — 이 프로젝트의 원칙("먼저 검증, 그다음 구현")을 따른 것이다.

## 1. 목표 (원본과 동일)

학생이 브라우저에서 MicroPython 코드를 작성하고, 가상 Pico 2 W 보드에 LED·버튼 같은
가상 부품을 연결한 뒤, **실행 중에 실시간으로 상호작용**(버튼을 누르면 그 순간 LED가
반응하는 것)까지 확인할 수 있어야 한다. 서버 비용 0원, 외부 CDN·Wokwi 비의존, 학교
네트워크에서도 동작.

## 2. 검증한 것 (2026-08-20)

### 2.1 빌드가 필요 없다

원본 문서는 "MicroPython을 WebAssembly로 직접 포팅"까지 각오하고 있었는데, 그럴 필요
없다. npm에 **MicroPython 리드 메인테이너(dpgeorge) 본인이 배포하는 사전 빌드 패키지**가
있다.

```
@micropython/micropython-webassembly-pyscript  (MIT, v1.28.0)
```

`micropython.wasm` 크기가 **446KB** — Pyodide(~10MB), clang.wasm(~50MB)에 비해 압도적으로
가볍다. `scripts/sync-pyodide.mjs`, `scripts/sync-clang.mjs`와 완전히 같은 패턴
(`node_modules` → `public/`로 코어 파일만 복사)으로 자체 호스팅할 수 있다.

### 2.2 `machine` 모듈은 원래 없다 — 처음부터 우리가 만드는 게 맞다

```python
>>> import machine
ImportError
```

이 WASM 빌드에는 `machine`이 아예 없다(브라우저에는 진짜 GPIO가 없으니 당연하다). 반대로
`time`/`utime`은 **진짜로 들어있고, `time.sleep()`은 진짜로 블로킹**이다(실측 확인, 아래
2.4 참고). `machine`은 우리가 통째로 새로 만들고, `time`은 우리 것으로 바꿔치기해야 한다.

### 2.3 커스텀 모듈 주입은 공식 API로 된다

`registerJsModule(name, jsObject)` — JS 객체를 Python에서 `import`되게 만드는 공식 API.
직접 재현해서 확인:

```python
import _chico_hw
class Pin:
    def __init__(self, n, mode): self.n = n
    def value(self, v): _chico_hw.pin_write(self.n, v)
led = Pin(15, Pin.OUT)
led.value(1)   # → JS 쪽 pin_write(15, 1) 실제로 호출됨, 확인 완료
```

### 2.4 진짜 문제: `time.sleep()`은 블로킹이고, 이게 실시간 상호작용을 막는다

`for i in range(3): time.sleep(0.2)`를 실행하는 동안 JS `setInterval`이 몇 번 도는지
세어봤다 — **0번**. WASM 호출이 시작되면 끝날 때까지 JS 이벤트 루프에 제어권을 전혀
돌려주지 않는다. Worker 안에서 도니까 탭 전체가 얼지는 않지만, 이 루프가 도는 동안
학생이 가상 버튼을 클릭해도 메시지가 워커 큐에 쌓이기만 하고 반영되지 않는다.

### 2.5 해결책 확인: `await`로 JS 쪽 async 함수를 부르면 진짜로 양보한다

`registerJsModule`로 등록한 함수가 **JS `async` 함수**이고, Python 쪽에서 그걸
**`await`로 호출**하면 얘기가 다르다. 실측:

```
tick 83 clicked= False
tick 84 clicked= False
[JS] 버튼 클릭! (500ms 시점)
tick 85 clicked= True     ← 클릭 직후 바로 잡아냄
```

`runPythonAsync`는 **모듈 최상위에서 `await`를 바로 지원**한다(별도 `asyncio.run()` 래핑도
필요 없음 — `asyncio.run`은 이 빌드에 아예 없다, `AttributeError` 확인). 즉 우리가 만드는
`machine`/`time` 셔임의 하드웨어 관련 호출들을 `await` 기반으로 만들고, 학생 코드에서 그
호출부만 `await`가 붙도록 우리가 감싸서 실행하면 실시간 상호작용이 된다.

### 2.6 설계를 더 단순화할 수 있다 — `await`가 필요한 건 `sleep`뿐이다

처음엔 `Pin.value()` 읽기/쓰기까지 전부 `await` 기반으로 만들려고 했는데, 다시 재현해보니
그럴 필요가 없었다. **버튼 상태를 읽는 `pin_read()`는 그냥 평범한 동기 함수로 두고,
`time.sleep()`만 `await` 기반으로 만들어도 실시간 반응이 된다:**

```
[JS] 버튼 클릭! (300ms 시점)
[JS] pin 15 = 1
tick 27 -> LED ON, 반응함        ← sleep 에서 돌아오자마자 바로 최신 버튼 상태를 봄
```

이유: `time.sleep()`이 `await`로 JS에 제어권을 돌려주는 동안 워커의 메시지 큐(버튼 클릭
등)가 처리되고, 그다음 줄의 평범한 동기 `pin.value()` 읽기는 그 최신 상태를 그냥 읽기만
하면 된다 — 읽기 자체가 기다릴 필요가 없다. **`machine.Pin`은 완전히 평범한 동기 클래스로
작성한다.** `await`를 신경 써야 하는 건 `time.sleep()`/`utime.sleep_ms()` 호출부뿐이다.

### 2.7 남은 제약 — 알고 받아들이는 부분 (MVP 범위)

`await`는 파이썬 문법상 `async def` 함수 안(또는 모듈 최상위)에서만 쓸 수 있다. 학생이
직접 `def`로 헬퍼 함수를 만들고 그 안에서 `time.sleep()`을 부르면, 그 함수도 `async def`가
되고 호출부도 `await`가 붙어야 하는 전파(propagation) 문제가 생긴다 — 2.6 덕분에 대상이
`sleep` 계열 호출로 좁혀지긴 했지만, 문제 자체는 남아있다. 제대로 하려면 AST 기반 변환이
필요하다(간단한 정규식 치환으로는 함수 정의 안팎을 안전하게 못 가른다).

**MVP는 여기까지 하지 않는다.** 대신 두 갈래로 나눈다:

- 학생 코드에 `def`가 없으면(=최상위 코드, `while True` 안에 바로 `time.sleep()`) →
  실시간 상호작용 모드로 실행 (`sleep` 호출부에 `await` 자동 삽입)
- 학생 코드에 `def`가 있으면 → 안전 모드로 실행 (`time.sleep()`이 진짜로 블로킹 —
  Python/C 실습과 동일한 수준: 실행하고 끝난 뒤 결과를 본다. 탭이 얼진 않지만 실행 중
  버튼 클릭이 바로 반영되진 않는다)

두 경우 다 **코드가 깨지거나 조용히 틀린 값을 주는 일은 없다** — 그게 제일 중요한
기준이다. 함수 안에서도 실시간 반응이 되게 하는 건 다음 단계(AST 변환)로 미룬다.
`CLab.tsx`의 `SupportNote`처럼 이 제약을 학생에게도 솔직하게 안내한다.

## 3. 아키텍처

```
학생 코드 (원본 그대로 보임)
   ↓ (내부에서만) def 유무로 분기 + await 자동 삽입
MicroPython WASM (Web Worker, registerJsModule 로 _chico_hw 주입)
   ↓
machine 셔임 (Pin — 우리가 작성) / time 셔임 (sys.modules 교체)
   ↓
Virtual GPIO 상태 (워커 안의 평범한 JS 객체)
   ↓ postMessage
React 상태 → LED/버튼 UI
```

- **SharedArrayBuffer 안 씀** — 기존 Python/C 실습과 같은 제약 유지, Google 로그인 팝업
  깨지는 문제 재발 안 함.
- **Worker 분리** — 무한루프 안전장치(`terminate()`)도 기존 Python/C 랩과 동일 패턴.
- **`registerJsModule`로 `machine`을 새로 만들고, `sys.modules['time']`을 우리 셔임으로
  덮어써서 `time.sleep()`을 가로챈다.**

## 4. Phase 0/1 범위 (이번에 만드는 것)

- `machine.Pin` — `OUT`/`IN`, `value()`/`on()`/`off()`/`toggle()`
- `time.sleep()` / `time.sleep_ms()` (interactive 모드에서만 실제로 짧게 쪼개서 대기)
- 부품: LED, 버튼 — 화면에서 "어느 GPIO에 연결할지" 선택하는 정도(드래그 배선 캔버스는
  이후 단계)
- 실행/중지 버튼, 콘솔(Python 랩과 같은 톤)

ADC/PWM/I2C/SPI/UART, 센서 확장(Phase 2~)은 이번 범위 밖 — 원본 문서의 단계 구분을
그대로 따른다.

## 5. 코드 위치

기존 구조를 따른다(`web/src/python/`, `web/src/c/`와 같은 레벨):

```
web/src/pico/
  pico.worker.ts   — MicroPython 로드, machine/time 셔임, 실행 러너
  usePico.ts       — usePython.ts 와 같은 패턴의 훅 (GPIO 상태 포함)
  examples.ts       — 예제 코드
web/src/pages/PicoLab.tsx  — 에디터 + 회로 영역 + 콘솔
```

`scripts/sync-micropython.mjs` 신규(`sync-pyodide.mjs` 패턴 그대로), `postinstall`에 추가.

## 6. 회로 캔버스 — 마우스로 배선 + 브레드보드 (2026-08-20 추가)

Phase 0/1 은 "LED 는 GPIO 몇 번"을 드롭다운으로 고르는 방식이었다. 사용자가 실제
Wokwi 류 이미지(부품 다리에서 보드 핀까지 전선이 이어진 그림)를 보여주며 **마우스로
직접 배선하고, 브레드보드도 전기적으로 진짜처럼 동작해야 한다**고 요청 — 드롭다운 방식은
폐기하고 아래 구조로 교체한다.

### 데이터 모델

- **보드 핀**: Pico 2 W 핀 배치(좌 1~20, 우 21~40)를 좌표+라벨로 고정 데이터화.
  GND 라벨을 공유하는 핀들은 실제 하드웨어처럼 전기적으로 전부 같은 노드로 자동 합친다
  (3V3 도 마찬가지 규칙 — "라벨이 같으면 같은 노드").
- **브레드보드**: 칸(column) 단위로 위쪽 5구멍/아래쪽 5구멍이 각각 하나의 전기 노드,
  거기에 전원 레일 2개(+/-) 추가. 실제 크기 전체(30칸 x 위아래 레일 2쌍)는 화면에 넣기
  부담스러워서 이번엔 10칸 + 상단 레일만 — 좁지만 "같은 줄 = 전기적으로 연결"이라는
  핵심은 그대로 보여준다. 필요하면 칸 수만 늘리면 되는 구조로 만든다.
- **부품 핀**: LED(양극/음극), 버튼(다리 2개) — 부품 위치가 바뀌어도 핀은 부품 기준 상대
  좌표로 따라다닌다.
- **전선**: 두 노드(보드 핀 / 브레드보드 구멍 / 부품 핀)를 잇는 리스트. 클릭 한 번으로
  시작 핀, 다시 클릭으로 끝 핀 — 드래그 라이브 프리뷰 대신 이 방식으로 갔다(구현 리스크가
  낮고 터치에서도 그대로 됨).

### 연결 해석

와이어 + 브레드보드 칸 규칙을 union-find 로 묶어서, 각 부품 핀이 최종적으로 어떤 GPIO
번호(있다면)에 물려있는지 매 변경마다 다시 계산한다. `usePico`/워커 쪽 GPIO 로직은
그대로 두고, "LED 가 GPIO 15 에 연결되어 있다"는 정보의 출처만 드롭다운에서 이 계산
결과로 바뀐다 — 부품이 여러 개면 자연히 여러 개가 동시에 동작한다.

### 코드 위치

```
web/src/pico/circuit/
  types.ts          — Point, PinRef, Wire, PlacedComponent 등
  board.ts          — Pico 2 W 핀 좌표/라벨 고정 데이터
  breadboard.ts      — 브레드보드 구멍 좌표 + 칸 그룹핑
  connectivity.ts    — union-find 로 GPIO 매핑 계산
  CircuitCanvas.tsx  — 드래그 배치 + 클릭 배선 SVG 캔버스
```

### 알고 있는 제약

- Pico 2 W 정확한 핀 라벨(특히 GP26~28 이후 RUN/ADC_VREF/3V3 계열)은 기억에 의존해서
  적었다 — 실제 데이터시트 대조는 다음에.
- 브레드보드는 10칸 + 상단 레일만(실제는 30칸+상하 레일). 필요해지면 칸 수 상수만
  늘리면 된다.
- 전선은 드래그 라이브 프리뷰가 아니라 클릭-클릭 방식이다.

## 7. 입출력 장치 팔레트 + 브레드보드 크기 선택 (2026-08-20 추가)

LED/버튼만 있던 걸 넓혔다. "회로" 패널을 탭(출력 장치 / 입력 장치 / 브레드보드)으로
나누고, 브레드보드도 여러 개를 크기 골라 놓을 수 있게 했다.

- **출력**: LED, RGB LED(r/g/b/공통 4핀 — 공통 음극 가정, 각 채널은 그냥 digital
  on/off), 부저(디지털 on/off, LED와 전기적으로 동일 취급— 소리는 아직 안 남)
- **입력**: 버튼(누르는 동안만), 스위치(클릭해서 계속 켜진 상태 유지 — 토글)
- **브레드보드**: 미니(10칸)/중간(20칸), 여러 개 놓고 각각 드래그로 옮기거나 삭제 가능
  (`breadboards` 를 컴포넌트처럼 상태 배열로 바꿈 — 예전엔 상수 하나였다)

**ADC/PWM 이 필요한 부품(가변저항, LDR, 서보 등)은 일부러 안 넣었다.** 회로에는
놓이는데 실제로는 코드가 반응하지 않는 부품을 만드는 게 이 프로젝트가 제일 경계하는
"거짓 지원"이라서다 — machine 모듈에 ADC/PWM 이 생기면 그때 같이 추가한다.

버그 하나 더 재현해서 고침: 전선 클릭 판정이 3px 선 위에서만 되던 문제 — 안 보이는
14px 굵기 선을 겹쳐 깔아서 클릭 영역을 넓혔다.

## 8. 회로 비주얼(Tinkercad 스타일) + 실행 중 편집 잠금 (2026-08-20 추가)

사용자가 Tinkercad(tinkercad.com) 아두이노 시뮬레이터를 참고 삼아 요청 — 회로가 그렇게
보이면 좋겠다는 것과, 코드 실행 중엔 회로/코드 편집이 막히고 실행 결과가 회로에서
보였으면 좋겠다는 것.

### 비주얼

- **전선을 직각 꺾임 대신 부드러운 베지어 곡선으로.** Tinkercad 케이블처럼 처지는
  느낌을 낸다(`wirePath` — 양 끝점에서 수평으로 뻗다가 만나는 3차 베지어).
- **브레드보드**: 줄 문자(a~e/f~j), 5칸마다 눈금 숫자, 전원 레일에 굵은 색선 +
  "+"/"−" 라벨, 중앙 골(gutter) 표시, 그림자.
- **Pico 보드**: USB 커넥터, BOOTSEL 버튼, 칩 사각형을 단순 도형으로 얹었다(첫 요청 때
  사용자가 보여준 참고 이미지에 있던 요소들). 핀은 검은 헤더 사각형 위에 놓인 동그라미로.
- **부품**: LED/RGB LED/부저 몸통에서 핀까지 내려가는 다리(리드선)를 그렸다. LED는
  돔 모양 + 하이라이트로 실제 부품처럼 보이게 했다. 전부 `filter: url(#chico-shadow)`
  로 그림자를 넣어 "기판 위에 놓인" 느낌을 냈다.
- 이 정도가 "합리적인 시간 안에 낼 수 있는 Tinkercad 느낌"의 선이라고 판단했다 —
  진짜 3D 렌더링이나 사진 같은 부품은 범위 밖으로 뒀다.

### 실행 중 편집 잠금

- `CircuitCanvas` 에 `locked` prop 추가. `locked=true` 면 배선 시작/완성, 부품·
  브레드보드 드래그, 추가/삭제, 팔레트 버튼이 전부 막힌다.
- **버튼/스위치를 누르는 건 예외로 뒀다** — `locked` 여부와 무관하게 항상 동작한다.
  이번 요청의 핵심이 "실행 중인 회로가 실제로 반응하는 걸 보는 것"이라, 상호작용
  자체를 잠그면 그 목적과 어긋난다고 판단했다.
- `PicoLab.tsx` 에서 `status === 'running'` 일 때 Monaco 에디터에 `readOnly: true`,
  예제 드롭다운에 `disabled`, `CircuitCanvas` 에 `locked` 를 넘긴다. 중지를 눌러야
  전부 풀린다.

### 검증

브라우저에서 실제로: 실행 중 에디터에 타이핑해도 안 들어가는 것, 팔레트 추가 버튼이
회색으로 비활성화되는 것, LED를 드래그해도 안 움직이는 것(pointerdown/move/up 을 직접
디스패치해서 확인), 그 상태에서 버튼을 누르면 LED 가 실제로 반응하는 것, 중지를 누르면
전부 원상복구되는 것까지 확인했다.

## 9. 교사 공개 제어 (2026-08-20 추가)

"교사는 보이지만 학생은 아직 준비중"으로 막아달라는 요청 — subjects.ts 의
published, labSettings 와 같은 패턴으로 풀었다.

- `practiceSettings/pico2w` 문서 하나(싱글턴)에 `open: boolean`. **기본값은
  false** — 다른 공개 필드들(기본 true, opt-out)과 반대인데, 이 기능을 넣는
  시점에 "아직 학생에게 열면 안 된다"는 요구사항 자체가 있어서 opt-in으로
  뒤집었다.
- `firestore.rules`: 읽기 공개(학생도 닫힘 여부를 봐야 ComingSoon 을 그릴 수
  있으니까), 쓰기는 `isTeacher()`만. **배포 완료함**(`npx firebase deploy
  --only firestore:rules`, chicode-b5713) — 로컬 파일만 고쳐두고 배포를 깜빡하면
  `permission-denied` 로 계속 닫힘 취급되는 걸 실제로 재현해서 확인했다.
- `PicoGate.tsx` 가 `/practice/pico` 의 새 진입점 — 교사는 이 설정과 무관하게
  항상 들어가고, 학생은 `open` 이 켜져 있어야 들어간다. **조회 실패(네트워크
  등)는 열림이 아니라 닫힘으로 처리한다** — 안전한 쪽으로 fail한다.
- 교사 페이지에 "🔌 실습" 탭 신설, Pico 2 W 하나만 켜고 끄는 토글 — Python/C는
  이미 열려 있어서 잠글 이유가 없다는 사용자 판단을 그대로 반영했다.

## 10. 다음 세션이 알아야 할 것

- 실측은 Node.js REPL(`scratchpad`)에서 한 것 — 실제 브라우저 Worker 안에서의 동작은
  구현 후 반드시 다시 확인해야 한다(Node와 브라우저의 async/이벤트 루프 처리가 완전히
  같다는 보장은 없다).
- `def` 유무로 안전 모드/상호작용 모드를 가르는 판단은 정규식 기반이다 — 문자열 리터럴
  안에 `"def "`가 우연히 들어간 경우 같은 엣지 케이스는 있을 수 있음(낮은 우선순위).
- ADC/PWM 등 다음 Phase에서 `await` 전파 문제를 AST 기반으로 제대로 풀지, 아니면 계속
  "함수 안은 안전 모드" 제약을 유지할지는 아직 결정 안 됨 — 학생들이 실제로 함수를 얼마나
  쓰는지 보고 판단하는 게 나을 듯.
