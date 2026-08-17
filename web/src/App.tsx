import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/', label: '홈', end: true },
  { to: '/materials', label: '수업자료', end: false },
  { to: '/python', label: 'Python 실습', end: false },
]

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-cream-deep bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <img
              src="/chicode.png"
              alt=""
              className="size-9 rounded-full ring-2 ring-cheese-300"
            />
            <span className="text-lg font-bold tracking-tight text-ink-900">CHICODE</span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  [
                    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
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
            className="ml-auto rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300 hover:text-ink-900"
          >
            교사 페이지
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-cream-deep px-5 py-6">
        <p className="mx-auto max-w-6xl text-sm text-ink-500">
          CHICODE — 치즈처럼 즐겁게, 코드처럼 단단하게.
        </p>
      </footer>
    </div>
  )
}
