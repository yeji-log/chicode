/**
 * Lab 활동의 각 항목(section)에 붙이는 첨부파일(이미지·동영상·PDF·PPT·엑셀).
 *
 * labSlides.ts 의 발표자료(PPT/PDF)와는 성격이 다르다 — 그쪽은 "다운로드
 * 금지, 뷰어로만" 이라는 요구사항 때문에 pptx-preview·PdfViewer를 동원한
 * 전용 뷰어가 필요했지만, 이 첨부파일은 그냥 수업자료 성격이라 다운로드를
 * 막을 이유가 없다. 그래서 훨씬 단순하다 — 이미지면 화면에 바로 보여주고,
 * 그 외(PDF/PPT/엑셀)는 다운로드 링크 하나만 둔다.
 *
 * 저장 방식은 chunkedFile.ts(Firestore 문서 조각) 그대로 재사용 — Storage가
 * 유료 플랜을 요구하는 이유는 materials.ts 상단 설명 참고.
 *
 *   labSectionFiles/{activityId}/files/{sectionId}   ← 메타 + chunks
 *
 * activityId + sectionId 조합이 슬롯 키다. section.id 는 교사가 항목을
 * 추가할 때 클라이언트에서 crypto.randomUUID() 로 한 번 정해지면 그 뒤로는
 * 안 바뀌므로(labs.ts), 항목을 삭제하지 않는 한 첨부파일도 그대로 붙어있다.
 */

import { doc } from 'firebase/firestore'

import {
  deleteChunkedFile,
  getChunkedFileMeta,
  loadChunkedFile,
  saveChunkedFile,
  type ChunkedFileMeta,
} from './chunkedFile'
import { db } from './firebase'

export class SectionAttachmentError extends Error {}

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
// 동영상은 다른 첨부보다 용량이 커지기 쉬워서 한도를 따로 둔다. Storage가
// 아니라 Firestore 문서 조각으로 저장하는 구조라(위 설명 참고) 재생 전에
// 전체를 한 번에 내려받아야 한다 — 스트리밍이 아니다. 그래서 무한정 늘리지
// 않고 "짧은 시연 클립" 정도로만 쓸 수 있게 50MB로 제한했다.
const MAX_VIDEO_SIZE = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'mp4',
]
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const VIDEO_EXTENSIONS = ['mp4']

const LAB_SECTION_FILES = 'labSectionFiles'

function attachmentDoc(activityId: string, sectionId: string) {
  return doc(db, LAB_SECTION_FILES, activityId, 'files', sectionId)
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

function assertValid(file: File) {
  const ext = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new SectionAttachmentError(
      `지원하지 않는 형식입니다 (.${ext || '확장자 없음'}). 허용: 이미지·동영상(mp4)·PDF·PPT·엑셀`,
    )
  }
  const maxSize = VIDEO_EXTENSIONS.includes(ext) ? MAX_VIDEO_SIZE : MAX_ATTACHMENT_SIZE
  if (file.size > maxSize) {
    throw new SectionAttachmentError(
      `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 ${maxSize / 1024 / 1024}MB까지 올릴 수 있습니다.`,
    )
  }
}

export function isImageAttachment(meta: ChunkedFileMeta): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(meta.filename))
}

export function isVideoAttachment(meta: ChunkedFileMeta): boolean {
  return VIDEO_EXTENSIONS.includes(extensionOf(meta.filename))
}

export async function uploadSectionAttachment(
  activityId: string,
  sectionId: string,
  file: File,
): Promise<ChunkedFileMeta> {
  assertValid(file)
  return saveChunkedFile(attachmentDoc(activityId, sectionId), file)
}

export function getSectionAttachmentMeta(
  activityId: string,
  sectionId: string,
): Promise<ChunkedFileMeta | null> {
  return getChunkedFileMeta(attachmentDoc(activityId, sectionId))
}

export function getSectionAttachmentFile(activityId: string, sectionId: string): Promise<Blob | null> {
  return loadChunkedFile(attachmentDoc(activityId, sectionId))
}

export function deleteSectionAttachment(activityId: string, sectionId: string): Promise<void> {
  return deleteChunkedFile(attachmentDoc(activityId, sectionId))
}
