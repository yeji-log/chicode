/**
 * Pyodide 런타임의 코어 파일만 public/pyodide 로 복사한다.
 *
 * node_modules 는 저장소에 올리지 않으므로, 다른 컴퓨터에서 clone 한 뒤
 * npm install 하면 postinstall 로 이 스크립트가 자동으로 돈다.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'node_modules', 'pyodide')
const TARGET = join(ROOT, 'public', 'pyodide')

// 표준 라이브러리까지 포함한 최소 구성. numpy 등 추가 패키지는 들어 있지 않다.
const FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  )

if (!(await exists(SOURCE))) {
  console.warn('[sync-pyodide] node_modules/pyodide 가 없어 건너뜁니다.')
  process.exit(0)
}

await mkdir(TARGET, { recursive: true })
for (const file of FILES) {
  await copyFile(join(SOURCE, file), join(TARGET, file))
}

console.log(`[sync-pyodide] ${FILES.length}개 파일을 public/pyodide 로 복사했습니다.`)
