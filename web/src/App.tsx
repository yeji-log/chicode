import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import PolicyModal from './components/PolicyModal'
import LabRules, { LAB_RULES_EFFECTIVE_DATE } from './content/LabRules'
import PrivacyPolicy, { PRIVACY_POLICY_EFFECTIVE_DATE } from './content/PrivacyPolicy'
import TermsOfService, { TERMS_OF_SERVICE_EFFECTIVE_DATE } from './content/TermsOfService'
import { asset } from './lib/asset'

type OpenPolicy = 'privacy' | 'terms' | 'labRules' | null

const TABS = [
  { to: '/', label: '홈', end: true },
  { to: '/materials', label: '수업자료', end: false },
  { to: '/practice', label: '실습', end: false },
  { to: '/projects', label: '프로젝트', end: false },
  { to: '/lab', label: 'Lab', end: false },
]

export default function App() {
  const [openPolicy, setOpenPolicy] = useState<OpenPolicy>(null)

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-cream-deep bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-5 sm:gap-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <img
              src={asset("chicode-mark.png")}
              alt=""
              className="size-9 rounded-full ring-2 ring-cheese-300"
            />
            <span className="text-lg font-bold tracking-tight text-ink-900">CHICODE</span>
          </NavLink>

          {/* 좁은 화면에서는 탭이 줄바꿈되는 대신 가로 스크롤되도록 한다 — 한글은
              단어 사이 공백이 없어 flex item이 좁아지면 글자 단위로 줄바꿈되어
              버린다(수/업/자/료 처럼 세로로 쌓임). min-w-0 + overflow-x-auto +
              각 탭 whitespace-nowrap 조합으로 막는다. */}
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  [
                    'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-cheese-200 text-ink-900'
                      : 'text-ink-700 hover:bg-cheese-100 hover:text-ink-900',
                  ].join(' ')
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <NavLink
            to="/teacher"
            className="shrink-0 whitespace-nowrap rounded-lg border border-cream-deep px-2.5 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 hover:text-ink-900 sm:px-3"
          >
            <span className="sm:hidden">교사</span>
            <span className="hidden sm:inline">교사 페이지</span>
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-cream-deep px-5 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-500">
          <p>CHICODE — 치즈처럼 즐겁게, 코드처럼 단단하게.</p>
          <p>© CHICODE. All rights reserved.</p>

          <div className="ml-auto flex items-center gap-4">
            <button
              onClick={() => setOpenPolicy('privacy')}
              className="font-semibold text-ink-500 underline decoration-cream-deep underline-offset-2 transition-colors hover:text-ink-900 hover:decoration-cheese-400"
            >
              개인정보처리방침
            </button>
            <button
              onClick={() => setOpenPolicy('terms')}
              className="font-semibold text-ink-500 underline decoration-cream-deep underline-offset-2 transition-colors hover:text-ink-900 hover:decoration-cheese-400"
            >
              이용약관
            </button>
            <button
              onClick={() => setOpenPolicy('labRules')}
              className="font-semibold text-ink-500 underline decoration-cream-deep underline-offset-2 transition-colors hover:text-ink-900 hover:decoration-cheese-400"
            >
              컴퓨터실 이용규칙
            </button>
          </div>
        </div>
      </footer>

      {openPolicy === 'privacy' && (
        <PolicyModal
          title="개인정보처리방침"
          effectiveDate={PRIVACY_POLICY_EFFECTIVE_DATE}
          onClose={() => setOpenPolicy(null)}
        >
          <PrivacyPolicy />
        </PolicyModal>
      )}
      {openPolicy === 'terms' && (
        <PolicyModal
          title="이용약관"
          effectiveDate={TERMS_OF_SERVICE_EFFECTIVE_DATE}
          onClose={() => setOpenPolicy(null)}
        >
          <TermsOfService />
        </PolicyModal>
      )}
      {openPolicy === 'labRules' && (
        <PolicyModal
          title="컴퓨터실 이용규칙"
          effectiveDate={LAB_RULES_EFFECTIVE_DATE}
          onClose={() => setOpenPolicy(null)}
        >
          <LabRules />
        </PolicyModal>
      )}
    </div>
  )
}
