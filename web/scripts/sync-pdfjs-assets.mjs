/**
 * pdf.js(pdfjs-dist)의 CMap·표준 폰트 데이터를 public/pdfjs 로 복사한다.
 *
 * 갤럭시 탭에서 발표 화면 크래시(Map.prototype.getOrInsertComputed 미지원,
 * mapUpsertPolyfill.ts 참고)를 고치고 나니, 이번엔 한글이 다 깨져서 보인다는
 * 실사용 보고를 받았다. PdfViewer.tsx 가 getDocument() 를 cMapUrl/
 * standardFontDataUrl 없이 호출하고 있었다 — pdf.js 는 이 값들이 없으면 한글
 * 같은 CJK 글자를 임베드된 폰트만으로 못 그리는 경우(예: 폰트가 임베드 안
 * 됐거나, CID 매핑이 필요한 인코딩) 깨진 글자나 네모만 남긴다.
 *
 * clang/pyodide/micropython 과 이유는 같지만(외부 CDN 금지 원칙), 이건
 * 네트워크로 새로 받아올 필요가 없다 — npm install 로 받은 pdfjs-dist 안에
 * 이미 다 들어있어서 그냥 복사만 하면 된다.
 */
import { cp, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_ROOT = join(ROOT, 'node_modules', 'pdfjs-dist')
const TARGET_ROOT = join(ROOT, 'public', 'pdfjs')

const DIRS = ['cmaps', 'standard_fonts']

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  )

if (!(await exists(SOURCE_ROOT))) {
  console.warn('[sync-pdfjs-assets] node_modules 에 pdfjs-dist 가 없어 건너뜁니다.')
  process.exit(0)
}

await mkdir(TARGET_ROOT, { recursive: true })
for (const dir of DIRS) {
  await cp(join(SOURCE_ROOT, dir), join(TARGET_ROOT, dir), { recursive: true })
}

console.log(`[sync-pdfjs-assets] ${DIRS.join(', ')} 를 public/pdfjs 로 복사했습니다.`)
