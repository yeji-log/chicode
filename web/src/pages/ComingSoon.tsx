import { Link } from 'react-router-dom'

import { asset } from '../lib/asset'

/**
 * 아직 내용이 없는 메뉴(프로젝트, Lab)를 위한 자리 표시 화면.
 *
 * 내비게이션에는 넣되 실제 기능은 다음 단계에서 채운다 — 죽은 링크(404)로
 * 두는 대신, 무엇을 준비 중인지 브랜드 톤으로 솔직하게 알려준다.
 */
export default function ComingSoon({
  emoji,
  title,
  description,
}: {
  emoji: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <img src={asset('chicode.png')} alt="" className="size-20 rounded-full ring-2 ring-cheese-300" />
      <span className="text-4xl">{emoji}</span>
      <h1 className="font-display text-2xl tracking-tight text-ink-900">{title}</h1>
      <p className="max-w-md text-ink-700">{description}</p>
      <span className="rounded-full bg-cheese-100 px-3 py-1 text-sm font-semibold text-cheese-600">
        준비 중
      </span>
      <Link
        to="/"
        className="mt-2 rounded-xl bg-cheese-400 px-5 py-3 font-bold text-ink-900 transition-colors hover:bg-cheese-300"
      >
        홈으로
      </Link>
    </div>
  )
}
