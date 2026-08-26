/// <reference lib="webworker" />
/**
 * Python 실행 워커.
 *
 * Python 은 학생 브라우저 안에서만 돈다(Pyodide = WebAssembly 로 컴파일된 CPython).
 * 서버는 정적 파일만 내려주므로 실행 횟수가 늘어도 서버 비용은 발생하지 않는다.
 *
 * 워커로 분리한 이유는 두 가지다.
 *  1. 무거운 실행이 화면을 얼리지 않는다.
 *  2. 무한 루프는 워커를 terminate() 해서 확실하게 끊을 수 있다 (usePython 의 stop).
 */
import type { PyodideInterface } from 'pyodide'

export type WorkerRequest = {
  type: 'run'
  code: string
  stdin: string
  /**
   * false 면 input() 이 진짜 CPython 처럼 동작한다 — 프롬프트만 출력하고 입력값은
   * 되풀이하지 않는다. 연습문제 채점이 이 모드를 쓴다(useGrader).
   *
   * 기본값(생략)은 true 로, Python 실습 화면의 지금 동작(입력값까지 함께 찍어
   * 터미널처럼 보이게 하기)을 그대로 유지한다 — 아래 _chicode_input 주석 참고.
   */
  echoInput?: boolean
}

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'boot-error'; message: string }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'image'; dataUrl: string }
  | { type: 'done'; ok: boolean; error?: string; elapsedMs: number }

const post = (message: WorkerResponse) => self.postMessage(message)

/** 배포 경로(vite base)를 그대로 따른다. 기본값은 '/'. */
const BASE_URL = import.meta.env.BASE_URL

/** 학생 코드가 읽어갈 입력 줄 — 실행마다 갈아끼운다. */
let stdinLines: string[] = []
let stdinCursor = 0

/** Python 쪽 _chicode_run 핸들 (RUNNER 참고). */
let runner: ((source: string) => string | undefined) | null = null
/** Python 쪽 _chicode_collect_images 핸들 (RUNNER 참고). */
let collectImages: (() => unknown) | null = null

/**
 * 출력 모드를 건다. 실습 화면과 채점이 서로 다른 것을 원한다.
 *
 * - batched(실습): Pyodide 가 한 줄씩, **줄바꿈을 떼고** 콜백을 부른다. 결과창은
 *   메시지 하나를 한 줄로 그리므로 화면이 정확히 맞는다.
 * - write(채점): 바이트를 그대로 넘겨준다. 채점기는 조각을 이어 붙여 통째로
 *   비교하는데, batched 로 받으면 줄바꿈이 전부 사라져서 여러 줄을 출력하는
 *   문제(구구단·별 삼각형·FizzBuzz…)가 전부 오답이 된다 — 실제로 20번 문제를
 *   채점하다 "1 2 4 5 7 8 10" 이 "12457810" 으로 붙는 걸 보고 찾았다.
 *
 * TextDecoder 는 stream 모드로 쓴다. 한글이 여러 바이트라, 조각 경계에서 잘리면
 * 글자가 깨진다.
 */
const decoder = new TextDecoder('utf-8')

function applyOutputMode(pyodide: PyodideInterface, batched: boolean) {
  if (batched) {
    pyodide.setStdout({ batched: (text: string) => post({ type: 'stdout', text }) })
    pyodide.setStderr({ batched: (text: string) => post({ type: 'stderr', text }) })
    return
  }
  pyodide.setStdout({
    write: (buffer: Uint8Array) => {
      post({ type: 'stdout', text: decoder.decode(buffer, { stream: true }) })
      return buffer.length
    },
  })
  pyodide.setStderr({
    write: (buffer: Uint8Array) => {
      post({ type: 'stderr', text: decoder.decode(buffer, { stream: true }) })
      return buffer.length
    },
  })
}

const bootPromise = boot()

async function boot(): Promise<PyodideInterface> {
  // public/pyodide 의 런타임을 그대로 불러온다. 번들러를 거치지 않으므로
  // 버전이 어긋날 일이 없고, 학교 네트워크가 CDN 을 막아도 동작한다.
  // 경로를 실행 시점에 조립하는 이유: 문자열 리터럴로 두면 Vite 가 이 import 를
  // 번들 대상으로 붙잡아 "public 파일은 import 할 수 없다"는 오류를 낸다.
  const runtimeUrl = `${self.location.origin}${BASE_URL}pyodide/pyodide.mjs`
  const { loadPyodide } = (await import(/* @vite-ignore */ runtimeUrl)) as {
    loadPyodide: (options: {
      indexURL: string
      env?: Record<string, string>
    }) => Promise<PyodideInterface>
  }

  const pyodide = await loadPyodide({
    indexURL: `${BASE_URL}pyodide/`,
    // matplotlib이 import 시점에 인터랙티브 백엔드를 고르지 않도록 미리 못박아 둔다.
    // 워커 안에는 화면이 없으니 캔버스를 그릴 대상이 없다 — Agg(이미지 전용
    // 렌더러)로 고정하고, 실행이 끝나면 그린 figure 를 PNG 로 꺼내 온다.
    env: { MPLBACKEND: 'Agg' },
  })

  applyOutputMode(pyodide, true)
  pyodide.setStdin({
    stdin: () => (stdinCursor < stdinLines.length ? stdinLines[stdinCursor++] : null),
  })

  pyodide.runPython(RUNNER)
  // 실행마다 새로 꺼내면 PyProxy 가 계속 쌓인다. 한 번만 붙잡아 두고 재사용한다.
  runner = pyodide.globals.get('_chicode_run')
  collectImages = pyodide.globals.get('_chicode_collect_images')

  return pyodide
}

bootPromise.then(
  () => post({ type: 'ready' }),
  (error: unknown) => post({ type: 'boot-error', message: describe(error) }),
)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'run') return

  const { code, stdin } = event.data
  const startedAt = performance.now()

  let pyodide: PyodideInterface
  try {
    pyodide = await bootPromise
  } catch (error) {
    post({ type: 'done', ok: false, error: describe(error), elapsedMs: 0 })
    return
  }

  stdinLines = stdin.length > 0 ? stdin.replace(/\n$/, '').split('\n') : []
  stdinCursor = 0
  // 채점은 입력값 되풀이를 끄고(RUNNER 의 _chicode_input 참고), 출력도 바이트
  // 그대로 받는다(applyOutputMode 참고). 두 가지가 늘 같이 움직여서 한 플래그로 묶는다.
  const grading = event.data.echoInput === false
  pyodide.globals.set('_chicode_echo_input', !grading)
  applyOutputMode(pyodide, !grading)

  try {
    // numpy 같은 외부 패키지를 import 하면 여기서 받아온다.
    // 코어 런타임만 로컬에 두었으므로 실패할 수 있고, 그때는 조용히 넘어가
    // 아래 실행에서 평소의 ImportError 로 학생에게 보이게 한다.
    try {
      await pyodide.loadPackagesFromImports(code)
    } catch {
      /* 표준 라이브러리만 쓰는 대부분의 수업 코드는 영향이 없다 */
    }

    // 실행과 오류 정리는 Python 쪽 _chicode_run 이 맡는다(RUNNER 참고).
    const error = runner?.(code)

    // matplotlib을 안 쓴 코드가 대부분이라, import 됐을 때만 그려진 figure 를 훑는다.
    if (pyodide.loadedPackages['matplotlib']) {
      // _chicode_collect_images 가 돌려주는 파이썬 리스트는 PyProxy 로 온다 —
      // toJs() 로 꺼내고 나면 프록시는 더 쓸 일이 없으니 바로 destroy 한다.
      const proxy = collectImages?.() as { toJs: () => string[]; destroy: () => void } | undefined
      for (const base64 of proxy?.toJs() ?? []) {
        post({ type: 'image', dataUrl: `data:image/png;base64,${base64}` })
      }
      proxy?.destroy()
    }

    post({
      type: 'done',
      ok: !error,
      error: error || undefined,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
  } catch (error) {
    post({
      type: 'done',
      ok: false,
      error: describe(error),
      elapsedMs: Math.round(performance.now() - startedAt),
    })
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 학생 코드를 실행하고 오류를 다듬는 Python 쪽 런너.
 *
 * 굳이 Python 안에서 도는 이유는 트레이스백 때문이다. JS 쪽에서 잡으면 Pyodide 내부
 * 프레임이 잔뜩 붙어 정작 학생 코드의 줄 번호가 묻힌다. 여기서 첫 프레임(런너 자신)만
 * 덜어내면 남는 건 학생이 쓴 코드의 위치뿐이다.
 */
const RUNNER = `
import builtins as _builtins, linecache as _linecache, sys as _sys, traceback as _traceback

_FILENAME = "내 코드"

# True 면 입력값을 결과창에 되풀이해 보여준다(실습 화면). 채점은 False 로 바꿔서
# 진짜 CPython 과 똑같이 동작하게 한다 — 워커가 실행 직전에 갈아끼운다.
_chicode_echo_input = True

def _chicode_input(prompt=""):
    """실습 화면에서는 input() 을 터미널처럼 보이게 한다.

    기본 input() 은 프롬프트를 줄바꿈 없이 출력해서 결과창에
    "이름: 나이: 치코드님은…" 처럼 뭉쳐 보이고, 무엇을 입력했는지도 알 수 없다.
    프롬프트와 입력값을 한 줄로 함께 찍어 실제 실행 화면처럼 읽히게 한다.

    다만 연습문제 채점에서는 이렇게 하면 안 된다 — 입력값(3, 5 …)이 출력에 섞여
    들어가서, 정답인 코드도 기대 출력과 절대 같아지지 않는다(실제로 채점 화면을
    만들다 이 문제를 밟았다). 그래서 채점 모드에서는 진짜 CPython 과 똑같이
    프롬프트만 찍고 입력값은 되풀이하지 않는다.
    """
    line = _sys.stdin.readline()
    if line == "":
        raise EOFError(
            "입력값이 모자랍니다. 왼쪽 아래 '입력값' 칸에 줄을 더 추가해 주세요."
        )
    line = line.rstrip("\\n")
    if _chicode_echo_input:
        print(f"{prompt}{line}")
    elif prompt:
        # 진짜 파이썬도 프롬프트는 표준출력으로 나간다. 그래서 안내 문구를 넣은 코드는
        # 채점에서 오답이 되는데, 그건 실물과 같은 동작이라 그대로 둔다 —
        # 연습문제 화면이 "안내 문구를 빼세요" 라고 미리 알려준다.
        print(prompt, end="")
    return line

_builtins.input = _chicode_input

def _chicode_run(source):
    """실행하고, 오류가 있으면 다듬은 트레이스백 문자열을 돌려준다."""
    # 실행할 때마다 새 전역 네임스페이스를 준다. 앞선 실행에서 만든 변수가 남아
    # "지웠는데 왜 되지?" 같은 혼란을 만들지 않도록.
    namespace = {"__name__": "__main__"}

    # 트레이스백이 문제가 된 코드 줄까지 함께 보여주도록 소스를 등록해 둔다.
    # (파일이 아니라 문자열을 실행하므로 이렇게 하지 않으면 줄 번호만 나온다)
    _linecache.cache[_FILENAME] = (len(source), None, source.splitlines(True), _FILENAME)

    try:
        exec(compile(source, _FILENAME, "exec"), namespace)
    except SystemExit:
        return None
    except BaseException:
        etype, evalue, tb = _sys.exc_info()
        # tb.tb_next 부터가 학생 코드의 프레임이다 (첫 프레임은 이 함수 자신).
        frames = tb.tb_next if tb is not None else None
        return "".join(_traceback.format_exception(etype, evalue, frames)).rstrip()
    finally:
        _sys.stdout.flush()
        _sys.stderr.flush()
    return None

def _chicode_collect_images():
    """matplotlib으로 그린 figure 를 PNG(base64) 리스트로 꺼내고 지운다.

    학생 코드에서 plt.show() 를 불러도 워커 안엔 화면이 없어 아무 일도
    일어나지 않는다(백엔드를 Agg 로 고정해 뒀다 — boot() 참고). 대신 실행이
    끝난 뒤 열려 있는 figure 를 전부 PNG 로 저장해 결과창에 이미지로 보여준다.
    """
    if "matplotlib.pyplot" not in _sys.modules:
        return []
    import base64 as _base64
    import io as _io

    _plt = _sys.modules["matplotlib.pyplot"]
    images = []
    for num in _plt.get_fignums():
        buf = _io.BytesIO()
        _plt.figure(num).savefig(buf, format="png", bbox_inches="tight")
        images.append(_base64.b64encode(buf.getvalue()).decode("ascii"))
    _plt.close("all")
    return images
`
