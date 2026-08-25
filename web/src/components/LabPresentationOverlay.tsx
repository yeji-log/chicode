import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { EMPTY_INK_STROKES, type InkStroke } from '../lib/labPresentation'
import PdfViewer from './PdfViewer'
import PresentationInk from './PresentationInk'

/**
 * 학생(또는 발표를 직접 조작하지 않는 교사) 화면에서 발표가 시작되면 자동으로
 * 뜨는 전체화면 슬라이드. 화면을 최대한 순수하게 유지하고 싶다는 요청으로
 * 안내 문구·"진짜 전체화면" 버튼을 뺐다 — 교사만 보는 "발표 제어하기"
 * 버튼만 남긴다(다른 기기에서 이어 조작할 수 있어야 해서).
 *
 * document.body에 포털로 그린다 — 갤럭시 탭 브라우저에서만 흰 화면만
 * 보인다는 실사용 보고가 있었다(조상 요소의 fixed containing block 문제나,
 * 뒤늦게 삽입된 fixed 레이어가 첫 페인트를 못 받는 문제를 의심해 넣은
 * 방어책 — 실기기로 검증한 수정은 아니다). 이후 "오버레이일 때만이 아니라
 * PDF 자체가 안 보인다"는 후속 보고를 받아서, 지금은 이 포털보다 PdfViewer
 * 쪽(로딩이 멈춘 채로 안 끝나는 경우) 쪽을 더 의심하고 있다.
 */
export default function LabPresentationOverlay({
  pdfFile,
  currentSlide,
  filename,
  ink,
  isTeacherViewer,
  onTakeControl,
}: {
  pdfFile: Blob
  currentSlide: number
  filename: string
  /** 슬라이드별 펜 획(Firestore 구독 값 그대로) — 읽기 전용으로만 그린다,
   *  여기서는 그릴 수 없다(교사 화면=LabPresenter에서만 그린다). */
  ink?: Record<number, InkStroke[]>
  isTeacherViewer: boolean
  onTakeControl: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 동적으로 삽입된 position:fixed 레이어가 일부 모바일 브라우저에서
    // 다음 리플로우 전까지 페인트되지 않는 문제의 방어책. resize 이벤트를
    // 인위적으로 한 번 흘려서 레이아웃을 강제로 다시 계산시킨다.
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [])

  return createPortal(
    // 아이패드에서 학생이 화면을 터치할 때 콜아웃 메뉴(복사하기·선택 영역
    // 찾기)가 뜨는 문제 방지 — LabPresenter.tsx와 같은 이유로 여기도 넓게
    // 적용한다. 이 화면은 읽기 전용(editable=false)이라 펜 오버레이가
    // 항상 pointerEvents:none 이고, 터치가 그대로 PdfViewer의 PDF
    // 캔버스로 넘어간다(그 캔버스 자체에도 별도로 적용해뒀다 —
    // PdfViewer.tsx 참고).
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-ink-900"
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <PdfViewer
        file={pdfFile}
        filename={filename}
        page={currentSlide}
        hideControls
        fitToContainer
        overlay={
          <PresentationInk
            strokes={ink?.[currentSlide] ?? EMPTY_INK_STROKES}
            editable={false}
            active={false}
          />
        }
      />
      {isTeacherViewer && (
        <button
          onClick={onTakeControl}
          className="absolute right-3 bottom-3 rounded-md border border-cream/30 bg-ink-900/80 px-2.5 py-1 text-xs font-semibold text-cream/90 hover:bg-white/10"
        >
          발표 제어하기
        </button>
      )}
    </div>,
    document.body,
  )
}
