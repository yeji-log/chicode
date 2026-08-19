import { Suspense, lazy, useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { getPicoPracticeSettings } from '../lib/practiceSettings'
import ComingSoon from './ComingSoon'

// Monaco 에디터는 무겁다(2MB 남짓) — pyodide.worker.ts/CLab 과 같은 이유로
// Pico 실습에 들어갈 때만 내려받는다.
const PicoLab = lazy(() => import('./PicoLab'))

const LOADING_FALLBACK = <p className="text-ink-500">Pico 실습 화면을 여는 중…</p>

/**
 * /practice/pico 게이트. LabGate.tsx 와 같은 패턴 — 교사는 설정과 무관하게
 * 항상 들어가고, 학생은 practiceSettings/pico2w 의 open 이 켜져 있어야 들어간다.
 *
 * subjects.ts 의 published(핀 게이트가 있는 과목)와 달리 여기는 핀이 없다 —
 * 지금 요청은 "교사만 먼저 볼 수 있게" 이지, 학생 접근을 핀으로 세분화해
 * 달라는 게 아니었다. 열림/닫힘 하나면 충분하다.
 */
export default function PicoGate() {
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [open, setOpen] = useState<boolean | null>(null)

  useEffect(() => {
    if (isTeacherViewer) return
    let cancelled = false
    getPicoPracticeSettings()
      .then((settings) => {
        if (!cancelled) setOpen(settings.open)
      })
      .catch((caught) => {
        // 조회 실패(네트워크·설정 오류)를 열림으로 잘못 해석하면 안 된다 —
        // "불러오는 중…"에 영원히 머무는 것도 막아야 하니, 안전하게 닫힘으로 처리한다.
        console.error('Pico 공개 설정 불러오기 실패', caught)
        if (!cancelled) setOpen(false)
      })
    return () => {
      cancelled = true
    }
  }, [isTeacherViewer])

  if (isTeacherViewer) {
    return (
      <Suspense fallback={LOADING_FALLBACK}>
        <PicoLab />
      </Suspense>
    )
  }

  if (open === null) return <p className="text-ink-500">불러오는 중…</p>

  if (!open) {
    return (
      <ComingSoon
        emoji="🔌"
        title="Pico 2 W 시뮬레이터"
        backTo={{ to: '/practice', label: '실습' }}
        description={
          <>
            브라우저에서 가상 Pico 2 W 보드로
            <br />
            GPIO, LED, 버튼을 직접 다뤄보세요.
          </>
        }
        secondary={{ to: '/practice/python', label: 'Python 실습 하러 가기' }}
      />
    )
  }

  return (
    <Suspense fallback={LOADING_FALLBACK}>
      <PicoLab />
    </Suspense>
  )
}
