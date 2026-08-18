import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

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
 *
 * document.body에 포털로 그린다 — 원래는 활동 페이지 DOM 깊숙이 중첩돼서
 * 그려졌는데, 갤럭시 탭 브라우저(Samsung Internet 추정)에서만 흰 화면만
 * 보인다는 실사용 보고가 있었다. 조상 요소 중 하나가 fixed 의 containing
 * block 을 바꿔버리는(transform 등) 케이스나, Firestore 이벤트로 뒤늦게
 * 동적으로 삽입된 fixed 레이어가 첫 페인트를 못 받는 부류의 문제가 특히
 * 구형 WebView 계열에서 보고돼 왔다 — body 바로 아래로 포털을 빼고, 마운트
 * 직후 강제로 리플로우를 한 번 걸어서 두 경우 모두에 대응한다. 실기기로
 * 검증한 수정은 아니다(재현 환경이 없음).
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

  useEffect(() => {
    // 동적으로 삽입된 position:fixed 레이어가 일부 모바일 브라우저에서
    // 다음 리플로우 전까지 페인트되지 않는 문제의 방어책. resize 이벤트를
    // 인위적으로 한 번 흘려서 레이아웃을 강제로 다시 계산시킨다.
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [])

  async function goRealFullscreen() {
    try {
      await containerRef.current?.requestFullscreen()
    } catch {
      // 지원하지 않는 브라우저(일부 iOS Safari 등)일 수 있다 — 이미 화면은
      // 꽉 차 있으니 실패해도 조용히 넘어간다.
    }
  }

  return createPortal(
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
    </div>,
    document.body,
  )
}
