import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore'

import { db } from './firebase'

/**
 * materials.ts 에서 쓰던 "파일을 Firestore 문서 조각으로 나눠 저장" 패턴을
 * 그대로 옮긴 범용 버전이다 (Cloud Storage 가 유료 플랜을 요구해서 안 쓰는
 * 이유는 materials.ts 상단 설명 참고). Lab 활동의 발표자료(PPT/PDF)도 같은
 * 문제를 겪어서 여기로 뺐다 — materials.ts 자체는 이미 동작하는 코드라
 * 손대지 않고 그대로 뒀다.
 *
 * 호출하는 쪽에서 파일 하나가 문서 하나(fileDoc)에 대응하도록 경로를 정하고,
 * 그 문서 아래 `chunks` 서브컬렉션에 조각이 저장된다.
 */

export interface ChunkedFileMeta {
  filename: string
  mimeType: string
  size: number
  chunkCount: number
  uploadedAt: number
}

/** 조각 하나에 담을 원본 바이트 수. base64 로 바뀌면 약 1.34배로 불어나므로
 *  512KB → 약 683KB 가 되어 Firestore 문서 1MiB 제한 안에 들어간다. */
const CHUNK_BYTES = 512 * 1024

export async function saveChunkedFile(
  fileDoc: DocumentReference,
  file: File,
): Promise<ChunkedFileMeta> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks = splitIntoBase64Chunks(bytes, CHUNK_BYTES)

  const meta: ChunkedFileMeta = {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    chunkCount: chunks.length,
    uploadedAt: Date.now(),
  }

  // 조각을 먼저 올리고 메타데이터를 마지막에 쓴다 — 중간에 실패해도 메타가
  // 없으면 "파일 있음" 취급을 안 하니 반쪽짜리 파일을 읽는 일이 없다.
  const batch = writeBatch(db)
  chunks.forEach((data, index) => {
    batch.set(doc(collection(fileDoc, 'chunks'), String(index)), { data })
  })
  await batch.commit()
  await setDoc(fileDoc, meta)

  return meta
}

/** 조각을 순서대로 읽어 하나의 Blob 으로 되돌린다. */
export async function loadChunkedFile(fileDoc: DocumentReference): Promise<Blob | null> {
  const metaSnapshot = await getDoc(fileDoc)
  if (!metaSnapshot.exists()) return null

  const meta = metaSnapshot.data() as ChunkedFileMeta
  const chunkSnapshot = await getDocs(collection(fileDoc, 'chunks'))

  const parts: Uint8Array[] = new Array(meta.chunkCount)
  for (const entry of chunkSnapshot.docs) {
    parts[Number(entry.id)] = base64ToBytes(entry.data().data as string)
  }
  if (parts.some((part) => part === undefined)) {
    throw new Error('파일 일부를 불러오지 못했습니다. 다시 시도해 주세요.')
  }

  return new Blob(parts as BlobPart[], { type: meta.mimeType })
}

export async function getChunkedFileMeta(
  fileDoc: DocumentReference,
): Promise<ChunkedFileMeta | null> {
  const snapshot = await getDoc(fileDoc)
  return snapshot.exists() ? (snapshot.data() as ChunkedFileMeta) : null
}

export async function deleteChunkedFile(fileDoc: DocumentReference): Promise<void> {
  await deleteDoc(fileDoc)
  const chunkSnapshot = await getDocs(collection(fileDoc, 'chunks'))
  const batch = writeBatch(db)
  chunkSnapshot.docs.forEach((entry) => batch.delete(entry.ref))
  await batch.commit()
}

function splitIntoBase64Chunks(bytes: Uint8Array, chunkBytes: number): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    chunks.push(bytesToBase64(bytes.subarray(offset, offset + chunkBytes)))
  }
  return chunks.length > 0 ? chunks : ['']
}

/** btoa 는 문자열을 받으므로 바이트를 먼저 문자열로 만들어야 한다.
 *  String.fromCharCode 에 배열을 통째로 넘기면 인자 수 한계에 걸리므로 잘라서 넘긴다. */
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
