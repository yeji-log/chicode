/**
 * Lab 활동에 첨부하는 발표자료(PPT) 데이터 계층.
 *
 * ── 왜 pptx 파일 하나로 안 끝나는가 ──
 * 브라우저에서 .pptx 를 직접 파싱해 보여주는 라이브러리(pptx-preview)를
 * 실제로 설치해서 테스트해봤는데, 생성한 pptx 파일을 조용히(에러 없이)
 * 빈 화면으로 렌더링했다 — 실제 파워포인트 파일에서는 다를 수 있지만
 * 신뢰하기엔 근거가 부족하다. 그래서 교사가 pptx 원본과 함께, 미리보기가
 * 깨졌을 때 대신 보여줄 PDF 버전을 "같이" 올릴 수 있게 했다(선택 사항이지만
 * 강력 권장). 학생 화면(PptxSlideViewer)은 pptx 렌더링을 먼저 시도하고,
 * 결과가 비어 있으면 PDF로 자동 전환한다.
 *
 * 저장 방식은 materials.ts 와 같은 이유(Firestore 무료 플랜, Storage 유료)로
 * chunkedFile.ts 의 조각 저장을 그대로 쓴다. 다만 학생이 원본 파일을
 * 내려받지 못하게 해야 해서(요구사항) — materials.ts 와 달리 다운로드 링크를
 * 절대 만들지 않는다. Blob 은 화면에 그리는 용도로만 메모리에 올린다.
 *
 *   labSlides/{activityId}/files/pptx   ← PPT 원본 메타 + chunks
 *   labSlides/{activityId}/files/pdf    ← 미리보기용 PDF 메타 + chunks (선택)
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

export class SlideValidationError extends Error {}

/** PPT는 이미지가 많아 자료(10MB)보다 크게 잡되, Firestore 무료 플랜
 *  총량(1GiB)을 한 활동이 잠식하지 않도록 여전히 제한한다. */
const MAX_SLIDE_FILE_SIZE = 25 * 1024 * 1024

const LAB_SLIDES = 'labSlides'
const FILES = 'files'

function pptxDoc(activityId: string) {
  return doc(db, LAB_SLIDES, activityId, FILES, 'pptx')
}
function pdfDoc(activityId: string) {
  return doc(db, LAB_SLIDES, activityId, FILES, 'pdf')
}

function assertExtension(file: File, ext: string) {
  if (!file.name.toLowerCase().endsWith(`.${ext}`)) {
    throw new SlideValidationError(`.${ext} 파일만 올릴 수 있습니다.`)
  }
}

function assertSize(file: File) {
  if (file.size > MAX_SLIDE_FILE_SIZE) {
    throw new SlideValidationError(
      `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 25MB까지 올릴 수 있습니다.`,
    )
  }
}

export interface LabSlideSet {
  pptx: ChunkedFileMeta | null
  pdf: ChunkedFileMeta | null
}

export async function getSlideSet(activityId: string): Promise<LabSlideSet> {
  const [pptx, pdf] = await Promise.all([
    getChunkedFileMeta(pptxDoc(activityId)),
    getChunkedFileMeta(pdfDoc(activityId)),
  ])
  return { pptx, pdf }
}

export async function uploadSlidePptx(activityId: string, file: File): Promise<ChunkedFileMeta> {
  assertExtension(file, 'pptx')
  assertSize(file)
  return saveChunkedFile(pptxDoc(activityId), file)
}

export async function uploadSlidePdf(activityId: string, file: File): Promise<ChunkedFileMeta> {
  assertExtension(file, 'pdf')
  assertSize(file)
  return saveChunkedFile(pdfDoc(activityId), file)
}

export function getSlidePptxFile(activityId: string): Promise<Blob | null> {
  return loadChunkedFile(pptxDoc(activityId))
}

export function getSlidePdfFile(activityId: string): Promise<Blob | null> {
  return loadChunkedFile(pdfDoc(activityId))
}

export function deleteSlidePptx(activityId: string): Promise<void> {
  return deleteChunkedFile(pptxDoc(activityId))
}

export function deleteSlidePdf(activityId: string): Promise<void> {
  return deleteChunkedFile(pdfDoc(activityId))
}
