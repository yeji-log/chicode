import { useRef } from 'react'

import PdfViewer from './PdfViewer'

/**
 * 학생(또는 발표를 직접 조작하지 않는 교사) 화면에서 발표가 시작되면 자동으로
 * 뜨는 전체화면 슬라이드.
 *
 * "자동으로 전체화면"을 브라우저의 진짜 Fullscreen API로는 할 수 없다 —
 * 그건 사용자 클릭 같은 제스처 없이는 브라우저가 무조건 거부한다(보안 정책,
 * 우회 불가). 대신 CSS로 뷰포트 전체를 덮는 고정 레이어를 쓴다 — 브라우저
 * 탭 자체는 남아있지만 화면은 슬라이드로 꽉 찬다. 진짜 전체화면(주소창까지
 * 숨기기)을 원하면 아래 버튼으로 한 번 더 눌러야 한다(그건 클릭이 있으니
 * 가능하다).
 */
export default function LabPresentationOverlay({
  pdfFile,
  currentSlide,
  isTeacherViewer,
  onTakeControl,
}: {
  pdfFile: Blob
  currentSlide: number
  isTeacherViewer: boolean
  onTakeControl: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  async function goRealFullscreen() {
    try {
      await containerRef.current?.requestFullscreen()
    } catch {
      // 지원하지 않는 브라우저(일부 iOS Safari 등)일 수 있다 — 이미 화면은
      // 꽉 차 있으니 실패해도 조용히 넘어간다.
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-ink-900">
      <div className="min-h-0 flex-1">
        <PdfViewer file={pdfFile} filename="발표자료" page={currentSlide} hideControls />
      </div>
      <div className="flex items-center justify-between gap-3 bg-ink-900 px-4 py-2">
        <span className="text-xs font-semibold text-cream/70">📡 지금 선생님이 발표 중입니다</span>
        <div className="flex items-center gap-2">
          {isTeacherViewer && (
            <button
              onClick={onTakeControl}
              className="rounded-md border border-cream/30 px-2.5 py-1 text-xs font-semibold text-cream/90 hover:bg-white/10"
            >
              발표 제어하기
            </button>
          )}
          <button
            onClick={goRealFullscreen}
            className="rounded-md border border-cream/30 px-2.5 py-1 text-xs font-semibold text-cream/90 hover:bg-white/10"
          >
            진짜 전체화면으로 보기
          </button>
        </div>
      </div>
    </div>
  )
}
