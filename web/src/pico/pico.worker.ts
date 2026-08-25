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
  /** 가변저항·조도센서 같은 아날로그 입력의 현재 값(0~65535). 버튼과 같은 경로다. */
  | { type: 'analog'; pin: number; value: number }
  /** 온습도 센서가 그 핀에서 읽어갈 값. 온도는 ℃, 습도는 %. */
  | { type: 'dht'; pin: number; temperature: number; humidity: number }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'boot-error'; message: string }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'gpio'; pin: number; value: 0 | 1 }
  /** PWM 상태. duty 0~65535, freq 는 Hz. deinit() 하면 duty 0 으로 온다. */
  | { type: 'pwm'; pin: number; freq: number; duty: number }
  /** 네오픽셀 한 줄의 현재 색. write() 를 불러야 나간다(실물과 같다). */
  | { type: 'neopixel'; pin: number; colors: string[] }
  | { type: 'done'; ok: boolean; error?: string; elapsedMs: number; interactive: boolean }

const post = (message: WorkerResponse) => self.postMessage(message)

/** 배포 경로(vite base)를 그대로 따른다. 기본값은 '/'. (pyodide.worker.ts 와 동일 트릭) */
const BASE_URL = import.meta.env.BASE_URL

/** 버튼 등 입력 부품의 현재 상태 — 학생 코드가 pin.value() 로 읽어가는 값. */
const gpioIn = new Map<number, boolean>()

/** 아날로그 입력(가변저항, 조도센서 등)의 현재 값 — machine.ADC.read_u16() 이
 *  읽어간다. 버튼(gpioIn)과 완전히 같은 구조라 새 경로를 만들지 않았다.
 *  실행마다 비우지 않는다 — 노브를 돌려둔 상태는 실행과 무관한 "물리적" 상태다
 *  (버튼을 누르고 있는 것과 같다). */
const adcIn = new Map<number, number>()

/** 온습도 센서(DHT11/22)가 핀마다 들고 있는 값. UI 의 슬라이더가 밀어 넣는다.
 *  아날로그 입력(adcIn)과 같은 구조지만 값이 두 개(온도/습도)라 따로 둔다. */
const dhtIn = new Map<number, { temperature: number; humidity: number }>()

/** 출력으로 쓴 핀의 마지막 값. 진짜 Pico 는 Pin.OUT 핀도 value() 로 읽으면 방금 쓴
 *  값이 나오는데, 여기엔 이 기록이 없어서 gpioIn(버튼 상태)을 대신 읽고 있었다.
 *  그래서 출력 핀은 value() 가 항상 0 이었고, toggle() 이 `value(0 if value() else 1)`
 *  이라 매번 1 만 쓰게 돼서 "LED 깜빡이기" 예제가 한 번 켜지고 그대로 멈췄다
 *  (실제로 재현해서 찾았다 — on()/off()/toggle() 직후 value() 가 전부 0 으로 찍힌다).
 *  실행마다 비운다 — 이전 실행의 핀 상태가 남으면 안 된다(UI 쪽 setGpio(new Map())
 *  와 같은 이유). */
const gpioOut = new Map<number, boolean>()

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
      gpioOut.set(pin, !!value)
      post({ type: 'gpio', pin, value: value ? 1 : 0 })
    },
    pin_read(pin: number) {
      // 출력으로 쓴 적이 있는 핀이면 그 값을, 아니면 입력(버튼/스위치) 상태를 준다.
      const out = gpioOut.get(pin)
      return out !== undefined ? out : (gpioIn.get(pin) ?? false)
    },
    /** 핀을 입력으로 다시 선언하면 출력 기록을 지운다 — 같은 실행 안에서 한 핀을
     *  OUT 으로 썼다가 IN 으로 바꾸면 옛날 출력값이 계속 읽히는 걸 막는다. */
    pin_clear_out(pin: number) {
      gpioOut.delete(pin)
    },
    /** 색 목록은 "r,g,b;r,g,b;…" 문자열로 받는다. Python 리스트를 그대로 넘기면
     *  JS 쪽에 프록시로 와서 다루기 번거로운데, 문자열은 그냥 값으로 넘어온다. */
    neopixel_write(pin: number, packed: string) {
      const colors = packed
        ? packed.split(';').map((c) => {
            const [r, g, b] = c.split(',').map((n) => Math.max(0, Math.min(255, Number(n) | 0)))
            return `rgb(${r}, ${g}, ${b})`
          })
        : []
      post({ type: 'neopixel', pin, colors })
    },
    pwm_set(pin: number, freq: number, duty: number) {
      // PWM 이 걸린 핀은 더는 단순 on/off 가 아니다 — Pin.value() 가 옛 출력값을
      // 읽지 않도록 기록을 지운다.
      gpioOut.delete(pin)
      post({ type: 'pwm', pin, freq, duty })
    },
    /** 온습도 센서 값. 아무것도 안 물려 있으면 실물이 그렇듯 읽기가 실패한다
     *  (measure() 가 OSError 를 낸다 — 아래 dht 모듈 참고). */
    dht_read(pin: number) {
      const v = dhtIn.get(pin)
      return v ? [v.temperature, v.humidity] : null
    },
    /** ADC 로 읽는 값(0~65535). 아무것도 안 물려 있으면 0 — 실제 보드에서 뜬 핀은
     *  값이 떠다니지만, 그걸 흉내 내면 "왜 자꾸 숫자가 바뀌냐"는 질문만 늘어난다. */
    adc_read(pin: number) {
      return adcIn.get(pin) ?? 0
    },
    /** 마이크로초 시계. MicroPython 자체 ticks_us() 는 1ms 단위로만 움직여서
     *  (재보니 최소 차이가 정확히 1000us) 초음파처럼 us 를 재는 코드가 성립하지
     *  않는다. performance.now() 는 이 환경에서 0.1ms 해상도라 10배 낫다.
     *  MicroPython 관례대로 2^30 으로 감싸서 돌려준다(ticks_diff 가 그 전제로 짜여 있다). */
    now_us() {
      return Math.round(performance.now() * 1000) % 1073741824
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

  if (message.type === 'analog') {
    adcIn.set(message.pin, Math.max(0, Math.min(65535, Math.round(message.value))))
    return
  }

  if (message.type === 'dht') {
    dhtIn.set(message.pin, { temperature: message.temperature, humidity: message.humidity })
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
    gpioOut.clear()
    await mp.runPythonAsync(RESET_GLOBALS_SOURCE)
    await mp.runPythonAsync(interactive ? INSTALL_INTERACTIVE_TIME_SOURCE : RESTORE_REAL_TIME_SOURCE)
    await mp.runPythonAsync(INSTALL_PRECISE_TICKS_SOURCE)

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

# 진짜 Pico 도 ADC 는 이 세 핀뿐이다(GP29 는 내부 전압 측정용이라 헤더에 안 나온다).
# 여기서 관대하게 아무 핀이나 받아주면, 시뮬레이터에서만 되는 코드를 가르치게 된다.
#
# 이름이 _chico_ 로 시작해야 한다 — RESET_GLOBALS_SOURCE 가 매 실행 전에 _chico 로
# 시작하지 않는 전역을 전부 지우기 때문에, _ADC_PINS 로 뒀더니 ADC() 안에서
# NameError: name '_ADC_PINS' isn't defined 가 났다(실제로 재현해서 찾았다).
_chico_adc_pins = (26, 27, 28)

def _chico_us_since(t0):
    d = (_chico_hw.now_us() - t0) & 0x3FFFFFFF
    return d - 0x40000000 if d >= 0x20000000 else d

def _chico_clamp_duty(d):
    d = int(d)
    return 0 if d < 0 else (65535 if d > 65535 else d)

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
            self._mode = None
            if mode is not None:
                self.init(mode, pull)

        def init(self, mode=None, pull=None):
            self._mode = mode
            # 입력으로 선언하면 이 핀의 출력 기록을 지운다(_chico_hw.pin_read 주석 참고).
            if mode == 0:
                _chico_hw.pin_clear_out(self.id)

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

    class ADC:
        def __init__(self, pin):
            # machine.ADC(26) 처럼 번호를 바로 주는 것도, ADC(Pin(26)) 도 둘 다 받는다.
            id = pin.id if hasattr(pin, "id") else pin
            if id not in _chico_adc_pins:
                raise ValueError(
                    "ADC는 GP26, GP27, GP28에서만 쓸 수 있어요 (받은 핀: GP%d)" % id
                )
            self.id = id

        def read_u16(self):
            return _chico_hw.adc_read(self.id)

    class PWM:
        """진짜 MicroPython 과 같은 모양으로 쓴다 — PWM(Pin(15)) 뒤에 freq()/duty_u16().
        인자 없이 부르면 지금 값을 돌려주는 것(getter)까지 실물과 같다."""

        def __init__(self, dest, freq=None, duty_u16=None):
            self.id = dest.id if hasattr(dest, "id") else dest
            self._freq = 1000
            self._duty = 0
            if freq is not None:
                self._freq = int(freq)
            if duty_u16 is not None:
                self._duty = _chico_clamp_duty(duty_u16)
            self._push()

        def freq(self, f=None):
            if f is None:
                return self._freq
            self._freq = int(f)
            self._push()

        def duty_u16(self, d=None):
            if d is None:
                return self._duty
            self._duty = _chico_clamp_duty(d)
            self._push()

        def duty_ns(self, ns=None):
            # 서보 예제가 이걸 자주 쓴다(예: 1500000ns = 가운데). 주기 대비 비율로 환산.
            period = 1000000000 // self._freq
            if ns is None:
                return self._duty * period // 65535
            self.duty_u16(int(ns) * 65535 // period)

        def deinit(self):
            self._duty = 0
            self._push()

        def _push(self):
            _chico_hw.pwm_set(self.id, self._freq, self._duty)

    mod = _Module()
    mod.Pin = Pin
    mod.ADC = ADC
    mod.PWM = PWM
    return mod

sys.modules["machine"] = _chico_build_machine()
del _chico_build_machine


def _chico_build_dht():
    """import dht 로 쓰는 온습도 모듈. 실물 DHT11/22 는 한 가닥 선으로 마이크로초
    단위 펄스를 주고받는 까다로운 프로토콜을 쓰는데, MicroPython 에서는 그걸 dht
    모듈이 감춰준다 — 학생이 쓰는 API 는 measure()/temperature()/humidity() 뿐이다.
    그래서 여기서도 프로토콜을 흉내 낼 필요 없이 그 세 개만 있으면 된다."""

    class _Module:
        pass

    class DHTBase:
        def __init__(self, pin):
            self.id = pin.id if hasattr(pin, "id") else pin
            self._t = 0
            self._h = 0

        def measure(self):
            # 실물도 센서가 안 붙어 있으면 여기서 OSError 를 낸다. 안 붙었는데 0도
            # 0% 를 돌려주면 "센서가 고장인지 안 꽂았는지" 를 구분할 수 없다.
            v = _chico_hw.dht_read(self.id)
            if v is None:
                raise OSError("온습도 센서가 연결되어 있지 않아요 (핀 GP%d)" % self.id)
            self._t = v[0]
            self._h = v[1]

        def temperature(self):
            return self._t

        def humidity(self):
            return self._h

    class DHT11(DHTBase):
        pass

    class DHT22(DHTBase):
        pass

    mod = _Module()
    mod.DHT11 = DHT11
    mod.DHT22 = DHT22
    return mod


sys.modules["dht"] = _chico_build_dht()
del _chico_build_dht


def _chico_build_neopixel():
    """import neopixel 로 쓰는 WS2812 스트립. 실물은 한 가닥 선에 800kHz 펄스를
    줄줄이 흘려보내는데, MicroPython 에서는 그 타이밍을 neopixel 모듈이 감춘다 —
    학생이 쓰는 건 np[i] = (r,g,b) 와 np.write() 뿐이라 여기서도 그것만 있으면 된다.

    write() 를 불러야 색이 나가는 것도 실물 그대로다. 이걸 빼먹어서 "왜 안 켜지지"
    하는 게 네오픽셀 첫 수업의 단골이라, 여기서도 똑같이 안 나가게 뒀다."""

    class _Module:
        pass

    class NeoPixel:
        def __init__(self, pin, n, bpp=3, timing=1):
            self.pin = pin.id if hasattr(pin, "id") else pin
            self.n = n
            self.buf = [(0, 0, 0)] * n

        def __len__(self):
            return self.n

        def __setitem__(self, i, color):
            self.buf[i] = (int(color[0]), int(color[1]), int(color[2]))

        def __getitem__(self, i):
            return self.buf[i]

        def fill(self, color):
            for i in range(self.n):
                self[i] = color

        def write(self):
            _chico_hw.neopixel_write(
                self.pin, ";".join("%d,%d,%d" % (c[0], c[1], c[2]) for c in self.buf)
            )

    mod = _Module()
    mod.NeoPixel = NeoPixel
    return mod


sys.modules["neopixel"] = _chico_build_neopixel()
del _chico_build_neopixel
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

/**
 * ticks_us/ticks_ms/ticks_diff 를 JS 시계로 갈아끼운다. 두 모드(실시간·안전) 모두에
 * 건다 — 초음파처럼 us 를 재는 코드는 대개 함수(def)를 써서 안전 모드로 돌기 때문이다.
 *
 * MicroPython 의 ticks_* 는 2^30 으로 감싸는 정수라, ticks_diff 도 그 전제로 부호를
 * 맞춰준다(그냥 빼면 감싸는 순간 음수 폭탄이 된다).
 */
const INSTALL_PRECISE_TICKS_SOURCE = `
import sys
import _chico_hw

_chico_tick_mod = sys.modules["time"]

def _chico_ticks_us():
    return _chico_hw.now_us()

def _chico_ticks_ms():
    return _chico_hw.now_us() // 1000

def _chico_ticks_diff(a, b):
    d = (a - b) & 0x3FFFFFFF
    return d - 0x40000000 if d >= 0x20000000 else d

_chico_tick_mod.ticks_us = _chico_ticks_us
_chico_tick_mod.ticks_ms = _chico_ticks_ms
_chico_tick_mod.ticks_diff = _chico_ticks_diff
del _chico_tick_mod, _chico_ticks_us, _chico_ticks_ms, _chico_ticks_diff
`

// _chico_ 로 시작하는 이름은 우리 인프라(브릿지, 모듈 로더)라서 지우지 않는다 —
// 안전 모드(RESTORE_REAL_TIME_SOURCE)는 _chico_hw 를 다시 import 하지 않으므로,
// 여기서 지워버리면 Pin.value() 가 NameError 로 죽는다(실제로 재현해서 찾은 버그).
const RESET_GLOBALS_SOURCE = `
for _chico_k in [_k for _k in globals() if not _k.startswith("_chico")]:
    del globals()[_chico_k]
`
