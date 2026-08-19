import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { asset } from '../lib/asset'

/**
 * 아직 내용이 없는 메뉴(프로젝트, Lab, Pico)를 위한 자리 표시 화면.
 *
 * 내비게이션에는 넣되 실제 기능은 다음 단계에서 채운다 — 죽은 링크(404)로
 * 두는 대신, 무엇을 준비 중인지 브랜드 톤으로 솔직하게 알려준다.
 */
export default function ComingSoon({
  emoji,
  title,
  description,
  secondary,
  backTo,
}: {
  emoji: string
  title: string
  description: ReactNode
  /** 지금 당장 해볼 수 있는 다른 곳으로 안내할 때만 넣는다 (예: Pico 대신 Python). */
  secondary?: { to: string; label: string }
  /** 상위 목록 화면으로 돌아가는 링크 (예: 실습 목록). CLab/PythonLab의
   *  "← 실습" 링크와 같은 자리 — 이 화면이 그 목록에서 들어온 하위
   *  페이지일 때만 넣는다. */
  backTo?: { to: string; label: string }
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      {backTo && (
        // CLab/PythonLab의 "← 실습" 링크와 같은 자리(왼쪽 정렬)를 맞추려고
        // 이 요소만 부모의 text-center를 깨고 w-full + text-left를 쓴다.
        <Link
          to={backTo.to}
          className="-mb-2 w-full text-left text-sm font-semibold text-ink-500 hover:text-ink-900"
        >
          ← {backTo.label}
        </Link>
      )}
      <img src={asset('chicode.png')} alt="" className="size-20 rounded-full ring-2 ring-cheese-300" />
      <span className="text-4xl">{emoji}</span>
      <h1 className="font-display text-2xl tracking-tight text-ink-900">{title}</h1>
      <p className="max-w-md break-keep text-ink-700">{description}</p>
      <span className="rounded-full bg-cheese-100 px-3 py-1 text-sm font-semibold text-cheese-600">
        준비 중
      </span>

      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {secondary && (
          <Link
            to={secondary.to}
            className="rounded-xl bg-cheese-400 px-5 py-3 font-bold text-ink-900 transition-colors hover:bg-cheese-300"
          >
            {secondary.label}
          </Link>
        )}
        <Link
          to="/"
          className={
            secondary
              ? 'rounded-xl border border-cream-deep px-5 py-3 font-bold text-ink-700 transition-colors hover:border-cheese-300'
              : 'rounded-xl bg-cheese-400 px-5 py-3 font-bold text-ink-900 transition-colors hover:bg-cheese-300'
          }
        >
          홈으로
        </Link>
      </div>
    </div>
  )
}
