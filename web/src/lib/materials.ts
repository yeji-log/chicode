/**
 * 수업자료 데이터 계층.
 *
 * 화면(components/pages)은 이 파일의 함수만 호출한다. 나중에 FastAPI + Firebase
 * Storage 로 옮길 때 이 파일의 본문만 fetch 호출로 바꾸면 화면은 그대로 둔 채
 * 서버 전환이 끝난다. 이 경계를 지키는 것이 이후 단계의 작업량을 결정한다.
 */

import { STORE_MATERIALS, dbDelete, dbGet, dbGetAll, dbPut } from './db'

export interface Material {
  id: string
  title: string
  description: string
  filename: string
  mimeType: string
  size: number
  createdAt: number
  /** MVP 한정: 파일 본체를 브라우저에 함께 저장한다. 서버 전환 시 storagePath 로 대체된다. */
  blob: Blob
}

/** 목록/상세 화면에 넘기는 형태 — 파일 본체는 필요할 때만 따로 읽는다. */
export type MaterialMeta = Omit<Material, 'blob'>

export type MaterialKind = 'pdf' | 'image' | 'text' | 'archive' | 'other'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md', 'py', 'zip']

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

export async function listMaterials(): Promise<MaterialMeta[]> {
  const rows = await dbGetAll<Material>(STORE_MATERIALS)
  return rows
    .map(({ blob: _blob, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function getMaterialFile(id: string): Promise<Blob | null> {
  const row = await dbGet<Material>(STORE_MATERIALS, id)
  return row?.blob ?? null
}

export class MaterialValidationError extends Error {}

export async function addMaterial(
  file: File,
  meta: { title?: string; description?: string } = {},
): Promise<MaterialMeta> {
  const ext = extensionOf(file.name)

  // 화면에서 막는 것과 별개로 저장 직전에 한 번 더 검사한다.
  // 서버를 붙이면 같은 검사를 백엔드에도 두어야 한다 — 이쪽 검사는 편의용일 뿐이다.
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

  const material: Material = {
    id: crypto.randomUUID(),
    title: meta.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
    description: meta.description?.trim() ?? '',
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
    blob: file,
  }

  await dbPut(STORE_MATERIALS, material)

  const { blob: _blob, ...result } = material
  return result
}

export async function deleteMaterial(id: string): Promise<void> {
  await dbDelete(STORE_MATERIALS, id)
}
