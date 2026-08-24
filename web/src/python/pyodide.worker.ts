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

export type WorkerRequest = { type: 'run'; code: string; stdin: string }

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

  pyodide.setStdout({ batched: (text: string) => post({ type: 'stdout', text }) })
  pyodide.setStderr({ batched: (text: string) => post({ type: 'stderr', text }) })
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

def _chicode_input(prompt=""):
    """input() 을 터미널처럼 보이게 한다.

    기본 input() 은 프롬프트를 줄바꿈 없이 출력해서 결과창에
    "이름: 나이: 치코드님은…" 처럼 뭉쳐 보이고, 무엇을 입력했는지도 알 수 없다.
    프롬프트와 입력값을 한 줄로 함께 찍어 실제 실행 화면처럼 읽히게 한다.
    """
    line = _sys.stdin.readline()
    if line == "":
        raise EOFError(
            "입력값이 모자랍니다. 왼쪽 아래 '입력값' 칸에 줄을 더 추가해 주세요."
        )
    line = line.rstrip("\\n")
    print(f"{prompt}{line}")
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
