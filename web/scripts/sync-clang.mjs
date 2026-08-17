/**
 * C 실습에 쓰는 clang 툴체인을 public/clang 으로 내려받는다.
 *
 * 합쳐서 약 51MB 라 저장소에는 올리지 않는다 (Pyodide 와 같은 방식).
 * clone 후 npm install 하면 postinstall 로 이 스크립트가 자동으로 돈다.
 *
 * 출처: binji/wasm-clang (LLVM/clang 8 을 WebAssembly 로 빌드한 것).
 * Runno(runno.dev)가 재배포하는 사본을 쓴다.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(ROOT, 'public', 'clang')
const BASE = 'https://runno.dev/langs'

/** 파일 크기가 이만큼보다 작으면 받다 만 것으로 보고 다시 받는다. */
const FILES = [
  { name: 'clang.wasm', minBytes: 25_000_000 },
  { name: 'wasm-ld.wasm', minBytes: 15_000_000 },
  { name: 'clang-fs.tar.gz', minBytes: 1_000_000 },
]

const sizeOf = (path) =>
  stat(path).then(
    (s) => s.size,
    () => -1,
  )

await mkdir(TARGET, { recursive: true })

let downloaded = 0
for (const file of FILES) {
  const target = join(TARGET, file.name)

  if ((await sizeOf(target)) >= file.minBytes) continue

  const url = `${BASE}/${file.name}`
  process.stdout.write(`[sync-clang] ${file.name} 내려받는 중…\n`)

  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`[sync-clang] ${url} 응답 오류: ${response.status}`)
  }

  // 받다가 끊기면 다음 실행에서 다시 받도록, 실패 시 남은 파일을 지운다.
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
  } catch (error) {
    await unlink(target).catch(() => {})
    throw error
  }

  if ((await sizeOf(target)) < file.minBytes) {
    await unlink(target).catch(() => {})
    throw new Error(`[sync-clang] ${file.name} 가 온전히 받아지지 않았습니다.`)
  }

  downloaded += 1
}

console.log(
  downloaded === 0
    ? '[sync-clang] clang 툴체인이 이미 준비되어 있습니다.'
    : `[sync-clang] ${downloaded}개 파일을 public/clang 으로 받았습니다.`,
)
