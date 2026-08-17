/// <reference lib="webworker" />
/**
 * C 실습 워커.
 *
 * Python 실습과 같은 구조다 — 무거운 일을 메인 스레드에서 떼어내, 컴파일이나
 * 무한 루프가 화면을 얼리지 않게 하고 "중지" 버튼으로 확실히 끊을 수 있게 한다.
 * (clang 은 30MB 짜리 wasm 이라 메인 스레드에서 돌리면 브라우저가 실제로 멈춘다.)
 *
 * 진행 순서:
 *   1. clang.wasm 으로 main.c → /program.o 컴파일
 *   2. wasm-ld.wasm 으로 /program.o + libc → /program.wasm 링크
 *   3. /program.wasm 을 실행하고 표준 출력을 돌려준다
 *
 * 세 단계 모두 같은 메모리 파일시스템(MemFS)을 공유한다.
 */
import { MemFS, runWasi } from './wasi'
import { gunzip, readTar } from './tar'

export type WorkerRequest = { type: 'run'; code: string; stdin: string }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'boot-error'; message: string }
  | { type: 'stage'; label: string }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'done'; ok: boolean; error?: string; elapsedMs: number }

const post = (message: WorkerResponse) => self.postMessage(message)

const BASE_URL = import.meta.env.BASE_URL

/** clang 은 이 경로에 표준 라이브러리와 헤더가 있다고 가정한다. */
const SYSROOT = '/sys'
const SOURCE_PATH = '/main.c'
const OBJECT_PATH = '/program.o'
const PROGRAM_PATH = '/program.wasm'

interface Toolchain {
  clang: WebAssembly.Module
  linker: WebAssembly.Module
  sysroot: { name: string; data: Uint8Array; isDir: boolean }[]
}

const bootPromise = boot()

async function boot(): Promise<Toolchain> {
  // 워커 안에서는 상대 경로가 워커 파일 기준으로 풀리므로 origin 을 붙여 확실히 한다.
  const base = new URL(`${BASE_URL}clang/`, self.location.origin).href

  // 어느 파일에서 막혔는지 알 수 있게 이름을 붙여 감싼다.
  // 셋 다 큰 파일이라 한꺼번에 받아 대기 시간을 줄인다.
  const [clang, linker, sysrootArchive] = await Promise.all([
    labelled('clang.wasm', () => WebAssembly.compileStreaming(fetch(`${base}clang.wasm`))),
    labelled('wasm-ld.wasm', () =>
      WebAssembly.compileStreaming(fetch(`${base}wasm-ld.wasm`)),
    ),
    labelled('clang-fs.tar.gz', async () => {
      const response = await fetch(`${base}clang-fs.tar.gz`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.arrayBuffer()
    }),
  ])

  return { clang, linker, sysroot: readTar(await unpack(sysrootArchive)) }
}

async function labelled<T>(name: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    throw new Error(`${name} — ${describe(error)}`)
  }
}

/**
 * 서버가 .tar.gz 를 Content-Encoding: gzip 으로 내려주면 브라우저가 이미 압축을
 * 풀어서 건네준다. 그때 또 풀려고 하면 실패하므로, gzip 표식(0x1f 0x8b)이 있을 때만 푼다.
 */
async function unpack(archive: ArrayBuffer): Promise<Uint8Array> {
  const head = new Uint8Array(archive, 0, Math.min(2, archive.byteLength))
  const isGzip = head[0] === 0x1f && head[1] === 0x8b
  return isGzip ? gunzip(archive) : new Uint8Array(archive)
}

bootPromise.then(
  () => post({ type: 'ready' }),
  (error: unknown) => post({ type: 'boot-error', message: describe(error) }),
)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'run') return

  const { code, stdin } = event.data
  const startedAt = performance.now()
  const elapsed = () => Math.round(performance.now() - startedAt)

  let toolchain: Toolchain
  try {
    toolchain = await bootPromise
  } catch (error) {
    post({ type: 'done', ok: false, error: describe(error), elapsedMs: 0 })
    return
  }

  // 실행마다 파일시스템을 새로 만든다. 앞선 실행에서 남은 결과물이 섞이지 않도록.
  const fs = new MemFS()
  for (const entry of toolchain.sysroot) {
    const path = '/' + entry.name
    if (entry.isDir) fs.mkdir(path)
    else fs.writeFile(path, entry.data)
  }
  fs.writeFile(SOURCE_PATH, new TextEncoder().encode(code))

  try {
    // ── 1. 컴파일 ──
    post({ type: 'stage', label: '컴파일 중…' })
    const diagnostics: string[] = []

    const compileStatus = await runWasi(toolchain.clang, {
      args: [
        'clang',
        '-cc1',
        '-triple',
        'wasm32-unknown-wasi',
        '-isysroot',
        SYSROOT,
        '-internal-isystem',
        `${SYSROOT}/include`,
        '-internal-isystem',
        `${SYSROOT}/lib/clang/8.0.1/include`,
        '-ferror-limit',
        '8',
        '-fmessage-length',
        '80',
        '-O2',
        '-emit-obj',
        '-o',
        OBJECT_PATH,
        SOURCE_PATH,
      ],
      fs,
      // 컴파일러가 내는 말은 학생 코드의 출력이 아니라 진단 메시지다.
      // 결과창에 섞지 않고 모아 두었다가, 실패했을 때만 보여준다.
      onStdout: (text) => diagnostics.push(text),
      onStderr: (text) => diagnostics.push(text),
    })

    if (compileStatus !== 0 || !fs.exists(OBJECT_PATH)) {
      post({
        type: 'done',
        ok: false,
        error: cleanDiagnostics(diagnostics),
        elapsedMs: elapsed(),
      })
      return
    }

    // ── 2. 링크 ──
    post({ type: 'stage', label: '연결 중…' })
    const linkMessages: string[] = []

    const linkStatus = await runWasi(toolchain.linker, {
      args: [
        'wasm-ld',
        '--no-threads',
        '--export-dynamic',
        '-z',
        'stack-size=1048576',
        `-L${SYSROOT}/lib/wasm32-wasi`,
        `${SYSROOT}/lib/wasm32-wasi/crt1.o`,
        OBJECT_PATH,
        '-lc',
        '-o',
        PROGRAM_PATH,
      ],
      fs,
      onStdout: (text) => linkMessages.push(text),
      onStderr: (text) => linkMessages.push(text),
    })

    const program = fs.readFile(PROGRAM_PATH)
    if (linkStatus !== 0 || !program) {
      post({
        type: 'done',
        ok: false,
        error: cleanDiagnostics(linkMessages),
        elapsedMs: elapsed(),
      })
      return
    }

    // ── 3. 실행 ──
    post({ type: 'stage', label: '실행 중…' })
    const compiled = await WebAssembly.compile(program.slice() as unknown as BufferSource)

    const exitCode = await runWasi(compiled, {
      args: ['program'],
      fs,
      stdin,
      onStdout: (text) => post({ type: 'stdout', text }),
      onStderr: (text) => post({ type: 'stderr', text }),
    })

    post({
      type: 'done',
      ok: true,
      // 0 이 아닌 종료 코드는 오류라기보다 프로그램의 결과다. 사실만 알려준다.
      error: exitCode === 0 ? undefined : `프로그램이 종료 코드 ${exitCode} 로 끝났습니다.`,
      elapsedMs: elapsed(),
    })
  } catch (error) {
    post({ type: 'done', ok: false, error: describe(error), elapsedMs: elapsed() })
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 컴파일러 메시지에서 학생에게 의미 없는 부분을 걷어낸다.
 * 내부 경로(/main.c)는 실제 파일 이름처럼 보이게 바꾸고, 빈 줄은 정리한다.
 */
function cleanDiagnostics(lines: string[]): string {
  const text = lines
    .join('\n')
    .replaceAll(SOURCE_PATH, '내 코드')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text || '컴파일에 실패했습니다.'
}
