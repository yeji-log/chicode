import { Link } from 'react-router-dom'

import { KIND_LABEL, KIND_PATH } from './shareLink'
import type { SharePayload } from './shareLink'
import type { UseSharedDraft } from './useSharedDraft'

/**
 * 공유 링크로 들어왔을 때 헤더 아래에 뜨는 확인 배너.
 * - 종류가 맞으면: "불러올까요?" — 지금 코드는 '불러오기 전 코드'로 백업된다.
 * - 종류가 안 맞으면: 올바른 실습으로 가는 링크(토큰째로).
 */
export default function IncomingShareBanner({
  draft,
  onAccept,
}: {
  draft: UseSharedDraft
  onAccept: (payload: SharePayload) => void
}) {
  if (draft.mismatch) {
    const label = KIND_LABEL[draft.mismatch.kind]
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cheese-300 bg-cheese-50 px-4 py-3 text-sm">
        <span className="font-semibold text-ink-900">
          이 링크는 {label} 실습 코드예요. {label} 실습에서 열 수 있어요.
        </span>
        <Link
          to={`/${KIND_PATH[draft.mismatch.kind]}#s=${draft.mismatch.token}`}
          className="ml-auto rounded-lg bg-cheese-300 px-3 py-1.5 font-bold text-ink-900 hover:bg-cheese-200"
        >
          {label} 실습으로 이동
        </Link>
      </div>
    )
  }

  if (!draft.incoming) return null
  const payload = draft.incoming

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cheese-300 bg-cheese-50 px-4 py-3 text-sm">
      <span className="font-semibold text-ink-900">
        공유된 코드를 불러올까요? 지금 코드는 보관함에 '불러오기 전 코드'로 저장됩니다.
      </span>
      <div className="ml-auto flex gap-2">
        <button
          onClick={() => onAccept(payload)}
          className="rounded-lg bg-cheese-300 px-3 py-1.5 font-bold text-ink-900 hover:bg-cheese-200"
        >
          불러오기
        </button>
        <button
          onClick={draft.dismissIncoming}
          className="rounded-lg border border-cream-deep px-3 py-1.5 font-semibold text-ink-700 hover:border-cheese-300"
        >
          취소
        </button>
      </div>
    </div>
  )
}
