import JSZip from 'jszip'

/**
 * PPT 파일 안의 "발표자 노트"를 슬라이드 순서대로 뽑아낸다.
 *
 * pptx-preview 로 슬라이드를 통째로 "그리는" 건 이미 신뢰할 수 없다고
 * 확인했지만(PptxSlideViewer.tsx 주석 참고), 노트는 이야기가 다르다 — pptx는
 * 그냥 zip 안에 표준 OOXML(XML) 파일들이 들어있는 구조라, 텍스트만 뽑는 건
 * 렌더링과 달리 해석의 여지가 없다. jszip으로 압축을 풀고 브라우저 내장
 * DOMParser로 파싱했다 — 실제로 pptxgenjs로 슬라이드 노트가 있는 테스트
 * 파일을 만들어 확인함.
 *
 * 슬라이드 → 노트slide 매핑은 파일명 번호(slide1.xml ↔ notesSlide1.xml)를
 * 믿지 않는다. 스펙상 보장되지 않는 관례일 뿐이라, 실제 관계
 * (ppt/presentation.xml 의 슬라이드 순서 → ppt/slides/_rels/*.rels 의
 * notesSlide 관계)를 따라간다.
 */
export async function extractNotesFromPptx(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(file)

  const presentationXml = await readXml(zip, 'ppt/presentation.xml')
  const presentationRels = await readXml(zip, 'ppt/_rels/presentation.xml.rels')
  if (!presentationXml || !presentationRels) return []

  // 1) presentation.xml 의 <p:sldIdLst> 순서대로 슬라이드 r:id 를 얻는다.
  const slideRIds = Array.from(presentationXml.getElementsByTagName('p:sldId')).map((node) =>
    node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'),
  )

  // 2) r:id → 슬라이드 파일 경로(presentation.xml.rels 에서 조회).
  const relsById = new Map<string, string>()
  for (const rel of Array.from(presentationRels.getElementsByTagName('Relationship'))) {
    relsById.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '')
  }
  const slidePaths = slideRIds
    .map((rId) => (rId ? relsById.get(rId) : undefined))
    .filter((target): target is string => Boolean(target))
    .map((target) => resolvePath('ppt/', target))

  // 3) 슬라이드마다 자신의 .rels 에서 notesSlide 관계를 찾는다.
  const notes: string[] = []
  for (const slidePath of slidePaths) {
    const relsPath = relsPathFor(slidePath)
    const slideRels = await readXml(zip, relsPath)
    const notesTarget = slideRels
      ? Array.from(slideRels.getElementsByTagName('Relationship')).find((rel) =>
          (rel.getAttribute('Type') ?? '').endsWith('/notesSlide'),
        )?.getAttribute('Target')
      : null

    if (!notesTarget) {
      notes.push('')
      continue
    }

    const notesPath = resolvePath(dirOf(slidePath), notesTarget)
    const notesXml = await readXml(zip, notesPath)
    notes.push(notesXml ? extractBodyText(notesXml) : '')
  }

  return notes
}

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const entry = zip.file(path)
  if (!entry) return null
  const text = await entry.async('string')
  return new DOMParser().parseFromString(text, 'application/xml')
}

/** 노트 슬라이드 안에서 "Notes Placeholder"(본문, type="body") 도형의 텍스트만 모은다.
 *  슬라이드 번호 placeholder(type="sldNum") 등 다른 도형은 건드리지 않는다. */
function extractBodyText(notesXml: Document): string {
  const shapes = Array.from(notesXml.getElementsByTagName('p:sp'))
  const bodyShape = shapes.find((sp) => {
    const ph = sp.getElementsByTagName('p:ph')[0]
    return ph?.getAttribute('type') === 'body'
  })
  if (!bodyShape) return ''

  const paragraphs = Array.from(bodyShape.getElementsByTagName('a:p'))
  return paragraphs
    .map((p) =>
      Array.from(p.getElementsByTagName('a:t'))
        .map((t) => t.textContent ?? '')
        .join(''),
    )
    .join('\n')
    .trim()
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx + 1)
}

function relsPathFor(path: string): string {
  const dir = dirOf(path)
  const name = path.slice(dir.length)
  return `${dir}_rels/${name}.rels`
}

/** OOXML 의 상대 경로(예: "../notesSlides/notesSlide1.xml")를 절대 zip 경로로 바꾼다. */
function resolvePath(baseDir: string, target: string): string {
  const parts = (baseDir + target).split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}
