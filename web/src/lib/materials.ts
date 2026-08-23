/**
 * 수업자료 데이터 계층.
 *
 * 화면(pages/*)은 이 파일의 함수만 호출한다. 저장 위치를 바꿀 때 손댈 곳은 여기뿐이다.
 *
 * ── 왜 파일을 Firestore 에 넣는가 ──
 * 파일은 원래 Cloud Storage 가 맡을 일이지만, Firebase 는 새 프로젝트에서 Storage 를
 * 쓰려면 유료(Blaze) 플랜을 요구한다. 무료(Spark)로 운영하기 위해 Firestore 를 쓴다.
 *
 * Firestore 는 문서 하나가 1MiB 를 넘을 수 없으므로 파일을 조각으로 나눠 저장한다.
 *
 *   materials/{id}              ← 제목·파일명·크기 같은 메타데이터
 *   materials/{id}/chunks/{n}   ← 파일 내용 (base64 조각)
 *
 * 나중에 Blaze 로 올려 Storage 를 쓰게 되면 이 파일의 함수 본문만 바꾸면 된다.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { db } from './firebase'

export interface MaterialMeta {
  id: string
  title: string
  description: string
  filename: string
  mimeType: string
  size: number
  /** 파일을 몇 조각으로 나눠 저장했는지 */
  chunkCount: number
  createdAt: number
  uploadedBy: string
  /** 어느 과목(subjects/{id})에 속하는지. 과목별 핀 잠금의 기준이 된다. */
  subjectId: string
}

export type MaterialKind = 'pdf' | 'image' | 'text' | 'archive' | 'other'

/** 무료 플랜의 Firestore 총 용량은 1GiB 다. 한 파일이 이를 잠식하지 않도록 묶어둔다. */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * 조각 하나에 담을 원본 바이트 수.
 * base64 로 바꾸면 약 1.34배로 불어나므로 512KB → 약 683KB 가 되어 1MiB 제한 안에 들어간다.
 */
const CHUNK_BYTES = 512 * 1024

/**
 * 한글(HWP/HWPX)·MS오피스 문서를 허용 목록에 추가했다(2026-08-23) — 학교
 * 현장에서 교사가 수업자료로 가장 흔히 쓰는 형식인데 원래는 빠져 있었다.
 * kindOf()는 이 확장자들을 'other'로 분류하지만, SubjectMaterials.tsx의
 * Viewer가 'other'를 이미 "미리보기 대신 다운로드" 흐름으로 처리하고
 * 있어서(하드코딩된 kind 분기가 pdf/image/text/archive뿐이라 나머지는
 * 전부 그리로 떨어진다) 화면 쪽은 손댈 게 없었다 — 실제로 코드를 읽어서
 * 확인했다.
 */
const ALLOWED_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'txt',
  'md',
  'csv',
  'py',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'zip',
]

const MATERIALS = 'materials'
const CHUNKS = 'chunks'

export class MaterialValidationError extends Error {}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

export function kindOf(material: Pick<MaterialMeta, 'filename' | 'mimeType'>): MaterialKind {
  const ext = extensionOf(material.filename)
  if (ext === 'pdf' || material.mimeType === 'application/pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  if (['txt', 'md', 'py'].includes(ext)) return 'text'
  if (ext === 'zip') return 'archive'
  return 'other'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * subjectId 를 주면 그 과목 자료만 가져온다.
 *
 * `where` 와 `orderBy(다른 필드)` 를 함께 쓰면 Firestore 가 복합 색인을 요구하므로,
 * 과목으로 걸러낸 뒤에는 정렬을 서버가 아니라 이 함수 안에서 직접 한다.
 */
export async function listMaterials(subjectId?: string): Promise<MaterialMeta[]> {
  if (subjectId) {
    const snapshot = await getDocs(
      query(collection(db, MATERIALS), where('subjectId', '==', subjectId)),
    )
    const materials = snapshot.docs.map(
      (entry) => ({ id: entry.id, ...entry.data() }) as MaterialMeta,
    )
    return materials.sort((a, b) => b.createdAt - a.createdAt)
  }

  const snapshot = await getDocs(
    query(collection(db, MATERIALS), orderBy('createdAt', 'desc')),
  )
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as MaterialMeta)
}

/**
 * 파일 내용을 조각째로 읽어 하나의 Blob 으로 되돌린다.
 * 조각은 순서대로 필요하므로 병렬로 받아 인덱스 순으로 붙인다.
 */
export async function getMaterialFile(id: string): Promise<Blob | null> {
  const metaSnapshot = await getDoc(doc(db, MATERIALS, id))
  if (!metaSnapshot.exists()) return null

  const meta = metaSnapshot.data() as MaterialMeta
  const chunkSnapshot = await getDocs(collection(db, MATERIALS, id, CHUNKS))

  const parts: Uint8Array[] = new Array(meta.chunkCount)
  for (const entry of chunkSnapshot.docs) {
    parts[Number(entry.id)] = base64ToBytes(entry.data().data as string)
  }

  if (parts.some((part) => part === undefined)) {
    throw new Error('자료 일부를 불러오지 못했습니다. 다시 시도해 주세요.')
  }

  return new Blob(parts as BlobPart[], { type: meta.mimeType })
}

export async function addMaterial(
  file: File,
  meta: { title?: string; description?: string; uploadedBy?: string; subjectId: string },
): Promise<MaterialMeta> {
  const ext = extensionOf(file.name)

  // 화면에서 막는 것과 별개로 저장 직전에 한 번 더 확인한다.
  // 진짜 방어선은 firestore.rules 다 — 이 검사는 사용자에게 이유를 알려주기 위한 것이다.
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new MaterialValidationError(
      `지원하지 않는 형식입니다 (.${ext || '확장자 없음'}). 허용: ${ALLOWED_EXTENSIONS.join(', ')}`,
    )
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new MaterialValidationError(
      `파일이 너무 큽니다 (${formatSize(file.size)}). 최대 ${formatSize(MAX_FILE_SIZE)}까지 올릴 수 있습니다.`,
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks = splitIntoBase64Chunks(bytes, CHUNK_BYTES)

  const id = crypto.randomUUID()
  const material: Omit<MaterialMeta, 'id'> = {
    title: meta.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
    description: meta.description?.trim() ?? '',
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    chunkCount: chunks.length,
    createdAt: Date.now(),
    uploadedBy: meta.uploadedBy ?? '',
    subjectId: meta.subjectId,
  }

  // 조각을 먼저 올리고 메타데이터를 마지막에 쓴다. 도중에 실패해도 목록에는
  // 나타나지 않으므로 학생이 반쪽짜리 자료를 여는 일이 없다.
  const batch = writeBatch(db)
  chunks.forEach((data, index) => {
    batch.set(doc(db, MATERIALS, id, CHUNKS, String(index)), { data })
  })
  await batch.commit()

  await setDoc(doc(db, MATERIALS, id), material)

  return { id, ...material }
}

export async function deleteMaterial(id: string): Promise<void> {
  // 메타데이터를 먼저 지운다. 조각 삭제가 중간에 끊겨도 목록에서는 사라진 상태가 된다.
  await deleteDoc(doc(db, MATERIALS, id))

  const chunkSnapshot = await getDocs(collection(db, MATERIALS, id, CHUNKS))
  const batch = writeBatch(db)
  chunkSnapshot.docs.forEach((entry) => batch.delete(entry.ref))
  await batch.commit()
}

/** 바이트 배열을 base64 문자열 조각들로 나눈다. */
function splitIntoBase64Chunks(bytes: Uint8Array, chunkBytes: number): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    chunks.push(bytesToBase64(bytes.subarray(offset, offset + chunkBytes)))
  }
  return chunks.length > 0 ? chunks : ['']
}

/**
 * btoa 는 문자열을 받으므로 바이트를 먼저 문자열로 만들어야 한다.
 * String.fromCharCode 에 배열을 통째로 넘기면 인자 수 한계에 걸리므로 잘라서 넘긴다.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const BLOCK = 8192
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BLOCK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BLOCK))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
