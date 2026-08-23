import { useEffect, type ReactNode } from 'react'

/**
 * 사이트 공용 모달 셸.
 *
 * PolicyModal.tsx가 이미 쓰던 패턴(오버레이 + 중앙 카드 + Escape 닫기 +
 * 배경 클릭 닫기)을 재사용 가능한 형태로 뺐다 — "모달이 사이트 안에서 두
 * 가지 다른 방식으로 보이지 않게" 하려는 그 원칙 그대로다.
 *
 * LabBoardEditor.tsx의 시즌/활동 수정 폼을 여기 담는다. 예전엔 "수정"을
 * 누르면 페이지 맨 위에 항상 떠 있던 폼(새로 만들 때도 같은 자리)이 내용을
 * 채우는 방식이었는데, charim(자매 프로젝트, github.com/yeji-log/charim)의
 * 과목 편집 화면이 목록은 그대로 두고 편집만 팝업으로 여는 걸 보고 사용자가
 * 요청해서 같은 구조로 바꿨다.
 */
export default function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string
  onClose: () => void
  /** 항목이 많은 폼(활동 편집처럼 섹션 목록이 들어가는 경우)에 준다. */
  wide?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
    >
      <div
        className={
          'flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ' +
          (wide ? 'max-h-[90vh] w-full max-w-3xl' : 'max-h-[85vh] w-full max-w-lg')
        }
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-cream-deep px-5 py-3.5">
          <h2 className="font-bold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300"
          >
            닫기
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  )
}
