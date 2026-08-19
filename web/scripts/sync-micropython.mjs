/**
 * MicroPython WebAssembly 런타임(Pico 2 W 시뮬레이터용)을 public/micropython 으로 복사한다.
 *
 * Pyodide/clang과 같은 이유로 저장소에는 올리지 않는다 — clone 후 npm install 하면
 * postinstall 로 이 스크립트가 자동으로 돈다.
 *
 * 출처: @micropython/micropython-webassembly-pyscript (MicroPython 리드 메인테이너
 * dpgeorge 가 npm 에 직접 배포하는 사전 빌드 패키지). 자체 Emscripten 빌드가 필요 없다 —
 * 실제로 설치해서 확인했다(pico2w_시뮬레이터_구현_계획.md 2.1 참고).
 *
 * 기본 micropython.wasm 만 쓴다 — ulab(numpy 비슷한 것)/settrace 변형은 지금 안 쓴다.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'node_modules', '@micropython', 'micropython-webassembly-pyscript')
const TARGET = join(ROOT, 'public', 'micropython')

const FILES = ['micropython.mjs', 'micropython.wasm']

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  )

if (!(await exists(SOURCE))) {
  console.warn('[sync-micropython] node_modules 에 패키지가 없어 건너뜁니다.')
  process.exit(0)
}

await mkdir(TARGET, { recursive: true })
for (const file of FILES) {
  await copyFile(join(SOURCE, file), join(TARGET, file))
}

console.log(`[sync-micropython] ${FILES.length}개 파일을 public/micropython 으로 복사했습니다.`)
