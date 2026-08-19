/// <reference lib="webworker" />
/**
 * Pico 2 W 시뮬레이터 실행 워커.
 *
 * MicroPython 은 학생 브라우저 안에서만 돈다(공식 WebAssembly 포트,
 * @micropython/micropython-webassembly-pyscript — Emscripten 빌드를 직접 할 필요 없이
 * npm 에 이미 사전 빌드되어 있다. 자세한 근거는 저장소 루트의
 * `pico2w_시뮬레이터_구현_계획.md` 참고).
 *
 * 이 WASM 빌드에는 `machine` 모듈이 원래 없다(브라우저에는 진짜 GPIO가 없으니까) —
 * 그래서 Pin 클래스를 Python 소스로 직접 써서 `sys.modules['machine']` 에 꽂아 넣는다.
 * `time`/`utime` 은 원래 있고 `time.sleep()` 은 진짜로 블로킹인데, 이게 "실행 중인 코드가
 * 버튼 클릭에 실시간으로 반응"하는 걸 막는다(실측 확인). 해결책: `time.sleep()` 호출부만
 * `await` 가 붙게 소스를 살짝 고쳐서, JS 쪽 async 함수로 만든 sleep 을 부르게 한다 —
 * await 로 넘어가는 동안 워커의 메시지 큐(버튼 클릭 등)가 처리된다.
 *
 * `await` 는 함수 정의(`def`) 안에서 쓰려면 그 함수도 `async def` 여야 하는데, 학생 코드를
 * 안전하게 그렇게까지 고쳐 쓰려면 AST 기반 변환이 필요하다(정규식으로는 위험).
 * 그래서 학생 코드에 `def` 가 있으면 안전 모드로 돌린다 — `time.sleep()` 이 진짜
 * 블로킹으로 동작하고(탭이 얼진 않음, 워커만 잠깐 멈춤), 실행 중 실시간 반응은
 * 보장하지 않는다. `def` 가 없으면(제일 흔한 초보자 패턴: `while True` 안에 바로
 * GPIO/sleep) 실시간 상호작용 모드로 돌린다.
 */
import type { MicroPythonInterface } from './micropython-types'

export type WorkerRequest =
  | { type: 'run'; code: string }
  | { type: 'button'; pin: number; pressed: boolean }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'boot-error'; message: string }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'gpio'; pin: number; value: 0 | 1 }
  | { type: 'done'; ok: boolean; error?: string; elapsedMs: number; interactive: boolean }

const post = (message: WorkerResponse) => self.postMessage(message)

/** 배포 경로(vite base)를 그대로 따른다. 기본값은 '/'. (pyodide.worker.ts 와 동일 트릭) */
const BASE_URL = import.meta.env.BASE_URL

/** 버튼 등 입력 부품의 현재 상태 — 학생 코드가 pin.value() 로 읽어가는 값. */
const gpioIn = new Map<number, boolean>()

const bootPromise = boot()

async function boot(): Promise<MicroPythonInterface> {
  // public/micropython 의 런타임을 그대로 불러온다 — 번들러를 거치지 않아 학교
  // 네트워크가 CDN 을 막아도 동작하고, 버전이 어긋날 일도 없다.
  const runtimeUrl = `${self.location.origin}${BASE_URL}micropython/micropython.mjs`
  const { loadMicroPython } = (await import(/* @vite-ignore */ runtimeUrl)) as {
    loadMicroPython: (options: {
      stdout?: (text: string) => void
      stderr?: (text: string) => void
    }) => Promise<MicroPythonInterface>
  }

  const mp = await loadMicroPython({
    stdout: (text: string) => post({ type: 'stdout', text }),
    stderr: (text: string) => post({ type: 'stderr', text }),
  })

  mp.registerJsModule('_chico_hw', {
    pin_write(pin: number, value: number) {
      post({ type: 'gpio', pin, value: value ? 1 : 0 })
    },
    pin_read(pin: number) {
      return gpioIn.get(pin) ?? false
    },
    // 유일하게 async 인 다리. await 로 불리면 JS 이벤트 루프에 제어권을 돌려줘서
    // 그 사이에 쌓인 'button' 메시지가 처리된다 (실측으로 확인한 방식).
    async sleep_ms(ms: number) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
    },
  })

  await mp.runPythonAsync(MACHINE_MODULE_SOURCE)

  return mp
}

bootPromise.then(
  () => post({ type: 'ready' }),
  (error: unknown) => post({ type: 'boot-error', message: describe(error) }),
)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  if (message.type === 'button') {
    gpioIn.set(message.pin, message.pressed)
    return
  }

  // type === 'run'
  const startedAt = performance.now()

  let mp: MicroPythonInterface
  try {
    mp = await bootPromise
  } catch (error) {
    post({ type: 'done', ok: false, error: describe(error), elapsedMs: 0, interactive: false })
    return
  }

  const interactive = !HAS_FUNCTION_DEF.test(message.code)

  try {
    // 실행마다 이전 실행의 전역 변수가 남지 않도록 정리한다(Python 실습의
    // "매번 새 namespace" 와 같은 이유 — "지웠는데 왜 되지?" 방지).
    await mp.runPythonAsync(RESET_GLOBALS_SOURCE)
    await mp.runPythonAsync(interactive ? INSTALL_INTERACTIVE_TIME_SOURCE : RESTORE_REAL_TIME_SOURCE)

    const source = interactive ? rewriteSleepCallsToAwait(message.code) : message.code
    await mp.runPythonAsync(source)

    post({
      type: 'done',
      ok: true,
      elapsedMs: Math.round(performance.now() - startedAt),
      interactive,
    })
  } catch (error) {
    post({
      type: 'done',
      ok: false,
      error: describe(error),
      elapsedMs: Math.round(performance.now() - startedAt),
      interactive,
    })
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/File "<stdin>"/g, '파일 "내 코드"')
  return String(error)
}

const HAS_FUNCTION_DEF = /^\s*(?:async\s+)?def\s+\w+\s*\(/m

/** time.sleep(...) / time.sleep_ms(...) / utime.sleep_us(...) 호출부에 await 를 붙인다. */
function rewriteSleepCallsToAwait(source: string): string {
  return source.replace(
    /\b((?:time|utime)\.sleep(?:_ms|_us)?\s*\()/g,
    (match, call: string, offset: number) => {
      const before = source.slice(Math.max(0, offset - 6), offset)
      return /await\s*$/.test(before) ? match : `await ${call}`
    },
  )
}

/**
 * machine.Pin — 완전히 평범한 동기 클래스로 쓴다. 읽기(value())도 그냥 동기 함수다.
 * 실시간성은 time.sleep() 쪽에서만 챙기면 되고(계획 문서 2.6 참고), Pin 자체는
 * await 를 몰라도 된다 — 그래야 학생이 짠 코드가 실제 Pico 코드와 100% 똑같이 보인다.
 */
const MACHINE_MODULE_SOURCE = `
import sys
import _chico_hw

def _chico_build_machine():
    # types.ModuleType 은 이 MicroPython WASM 빌드에서 직접 인스턴스화가 안 된다
    # ("TypeError: can't create 'module' instances", 실행해보고 확인함).
    # sys.modules 에 들어가는 값은 getattr 만 되면 되므로 평범한 클래스 인스턴스로 대신한다.
    class _Module:
        pass

    class Pin:
        OUT = 1
        IN = 0
        PULL_UP = 1
        PULL_DOWN = 2

        def __init__(self, id, mode=None, pull=None):
            self.id = id
            if mode is not None:
                self.init(mode, pull)

        def init(self, mode=None, pull=None):
            self._mode = mode

        def value(self, v=None):
            if v is None:
                return 1 if _chico_hw.pin_read(self.id) else 0
            _chico_hw.pin_write(self.id, 1 if v else 0)

        def on(self):
            _chico_hw.pin_write(self.id, 1)

        def high(self):
            _chico_hw.pin_write(self.id, 1)

        def off(self):
            _chico_hw.pin_write(self.id, 0)

        def low(self):
            _chico_hw.pin_write(self.id, 0)

        def toggle(self):
            self.value(0 if self.value() else 1)

    mod = _Module()
    mod.Pin = Pin
    return mod

sys.modules["machine"] = _chico_build_machine()
del _chico_build_machine
`

/**
 * time.sleep 계열을 await 가능한 버전으로 바꿔치기한다 (interactive 모드에서만 씀).
 * ticks_ms 등 나머지는 원래 time 모듈 것을 그대로 물려받는다 — 학생이 논블로킹
 * 타이밍 패턴(ticks_diff 등)을 써도 깨지지 않도록.
 */
const INSTALL_INTERACTIVE_TIME_SOURCE = `
import sys
import time as _chico_real_time
import _chico_hw

def _chico_build_time():
    class _Module:
        pass

    mod = _Module()
    for _name in dir(_chico_real_time):
        if not _name.startswith("_"):
            setattr(mod, _name, getattr(_chico_real_time, _name))

    async def sleep(seconds):
        await _chico_hw.sleep_ms(int(seconds * 1000))

    async def sleep_ms(ms):
        await _chico_hw.sleep_ms(ms)

    async def sleep_us(us):
        await _chico_hw.sleep_ms(max(0, us // 1000))

    mod.sleep = sleep
    mod.sleep_ms = sleep_ms
    mod.sleep_us = sleep_us
    return mod

_m = _chico_build_time()
sys.modules["time"] = _m
sys.modules["utime"] = _m
del _chico_build_time, _m
`

/** 안전 모드로 돌아갈 때 원래(진짜 블로킹) time 모듈을 복원한다. */
const RESTORE_REAL_TIME_SOURCE = `
import sys
import time as _chico_real_time
sys.modules["time"] = _chico_real_time
sys.modules["utime"] = _chico_real_time
`

// _chico_ 로 시작하는 이름은 우리 인프라(브릿지, 모듈 로더)라서 지우지 않는다 —
// 안전 모드(RESTORE_REAL_TIME_SOURCE)는 _chico_hw 를 다시 import 하지 않으므로,
// 여기서 지워버리면 Pin.value() 가 NameError 로 죽는다(실제로 재현해서 찾은 버그).
const RESET_GLOBALS_SOURCE = `
for _chico_k in [_k for _k in globals() if not _k.startswith("_chico")]:
    del globals()[_chico_k]
`
