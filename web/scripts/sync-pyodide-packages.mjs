/**
 * numpy / pandas / matplotlib 과 그 의존 패키지를 public/pyodide 로 내려받는다.
 *
 * Pyodide npm 패키지에는 코어 런타임만 들어있고(sync-pyodide.mjs), 개별 패키지의
 * .whl 파일은 포함돼 있지 않다 — pyodide-lock.json 에 이름·해시만 적혀 있고
 * 실제 파일은 Pyodide 가 배포하는 CDN(jsdelivr)에서 받아야 한다.
 *
 * "외부 CDN 의존 금지" 원칙(CLAUDE.md)에 따라, 학생이 실습을 실행할 때 CDN을
 * 치는 게 아니라 여기서 미리 받아 public/pyodide 에 자체 호스팅해 둔다.
 * (clang.wasm 도 같은 이유로 postinstall 때 미리 받아둔다 — sync-clang.mjs 참고)
 *
 * 의존성은 하드코딩하지 않고 pyodide-lock.json 의 depends 를 따라간다 —
 * Pyodide 버전이 올라가면 numpy/pandas/matplotlib 의 의존 목록도 바뀔 수 있어서다.
 */
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PYODIDE_PKG = join(ROOT, 'node_modules', 'pyodide')
const TARGET = join(ROOT, 'public', 'pyodide')

// Python 실습에서 열어주고 싶은 최상위 패키지. 나머지는 여기서부터 depends 를
// 따라가며 자동으로 찾는다.
const TOP_LEVEL = ['numpy', 'pandas', 'matplotlib']

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  )

async function sha256Of(path) {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

if (!(await exists(PYODIDE_PKG))) {
  console.warn('[sync-pyodide-packages] node_modules/pyodide 가 없어 건너뜁니다.')
  process.exit(0)
}

const { version } = JSON.parse(await readFile(join(PYODIDE_PKG, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(PYODIDE_PKG, 'pyodide-lock.json'), 'utf8'))

// 이름 대소문자가 다를 수 있어(예: Pillow) 소문자 키로도 찾을 수 있게 색인해 둔다.
const byLowerName = new Map(Object.values(lock.packages).map((pkg) => [pkg.name.toLowerCase(), pkg]))

const closure = new Map()
function collect(name) {
  const pkg = lock.packages[name] ?? byLowerName.get(name.toLowerCase())
  if (!pkg) {
    console.warn(`[sync-pyodide-packages] pyodide-lock.json 에 "${name}" 이 없습니다 — 건너뜁니다.`)
    return
  }
  if (closure.has(pkg.name)) return
  closure.set(pkg.name, pkg)
  for (const dep of pkg.depends ?? []) collect(dep)
}
TOP_LEVEL.forEach(collect)

const packages = [...closure.values()].sort((a, b) => a.name.localeCompare(b.name))
console.log(
  `[sync-pyodide-packages] pyodide v${version} 기준 ${packages.length}개 패키지: ` +
    packages.map((p) => p.name).join(', '),
)

await mkdir(TARGET, { recursive: true })

const BASE = `https://cdn.jsdelivr.net/pyodide/v${version}/full`

let downloaded = 0
for (const pkg of packages) {
  const target = join(TARGET, pkg.file_name)

  if (await exists(target)) {
    const hash = await sha256Of(target)
    if (hash === pkg.sha256) continue
    console.warn(`[sync-pyodide-packages] ${pkg.file_name} 해시가 달라 다시 받습니다.`)
  }

  const url = `${BASE}/${pkg.file_name}`
  process.stdout.write(`[sync-pyodide-packages] ${pkg.file_name} 내려받는 중…\n`)

  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`[sync-pyodide-packages] ${url} 응답 오류: ${response.status}`)
  }

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
  } catch (error) {
    await unlink(target).catch(() => {})
    throw error
  }

  const hash = await sha256Of(target)
  if (hash !== pkg.sha256) {
    await unlink(target).catch(() => {})
    throw new Error(`[sync-pyodide-packages] ${pkg.file_name} 해시가 맞지 않습니다 (받다 만 것으로 보임).`)
  }

  downloaded += 1
}

console.log(
  downloaded > 0
    ? `[sync-pyodide-packages] ${downloaded}개 파일을 새로 받았습니다 (전체 ${packages.length}개, public/pyodide).`
    : `[sync-pyodide-packages] 이미 전부 최신입니다 (${packages.length}개).`,
)
