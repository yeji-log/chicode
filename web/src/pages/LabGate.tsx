import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { getHomeSettings, isLabUnlocked, unlockLab } from '../lib/labs'
import { usePinAttemptThrottle } from '../lib/pinThrottle'

/**
 * /lab 하위 전체(홈·로드맵·활동·활동 상세)를 감싸는 핀 게이트.
 *
 * SubjectMaterials.tsx 의 PinGate 와 같은 패턴이다 — 다만 Lab 은 과목처럼
 * 여러 개가 아니라 하나뿐이라 잠금도 하나(labSettings/home 의 pin 필드)다.
 * main.tsx 에서 이 컴포넌트를 /lab 의 부모 라우트로 두고, 실제 화면들은
 * <Outlet/> 으로 그 아래에 매달린다 — /lab/activities 처럼 자식 경로로 바로
 * 들어와도 핀을 건너뛸 수 없다.
 *
 * 로그인한 교사는 핀 없이 바로 들어간다 — SubjectMaterials.tsx 와 같은 이유.
 */
export default function LabGate() {
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [unlocked, setUnlocked] = useState(() => isLabUnlocked())
  const [pin, setPin] = useState('0000')
  const [loading, setLoading] = useState(() => !isLabUnlocked())

  useEffect(() => {
    if (unlocked || isTeacherViewer) return
    getHomeSettings()
      .then((settings) => setPin(settings.pin || '0000'))
      .finally(() => setLoading(false))
  }, [unlocked, isTeacherViewer])

  if (unlocked || isTeacherViewer) return <Outlet />
  if (loading) return <p className="text-ink-500">불러오는 중…</p>

  return <PinGate pin={pin} onUnlock={() => setUnlocked(true)} />
}

function PinGate({ pin, onUnlock }: { pin: string; onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  // SubjectMaterials.tsx 의 과목별 게이트와 별개로 세도록 'lab' 로 키를 나눈다
  // — pinThrottle.ts 설명 참고.
  const { isLocked, isBusy, remainingSeconds, recordFailure, reset } = usePinAttemptThrottle('lab')

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isLocked || isBusy) return
    if (value.trim().length > 0 && value.trim() === pin) {
      reset()
      unlockLab()
      onUnlock()
    } else {
      recordFailure()
      setError('핀번호가 올바르지 않습니다.')
    }
  }

  const disabled = isLocked || isBusy

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <span className="text-4xl">🔒</span>
      <h1 className="text-xl font-extrabold text-ink-900">EMBED-LAB</h1>
      <p className="text-sm text-ink-500">선생님이 알려준 핀번호를 입력하세요.</p>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          inputMode="numeric"
          autoFocus
          disabled={disabled}
          placeholder="핀번호"
          className="rounded-lg border border-cream-deep bg-white px-3 py-2.5 text-center text-lg tracking-widest text-ink-900 focus:border-cheese-300 focus:outline-none disabled:opacity-50"
        />
        {isLocked ? (
          <p className="text-sm text-red-700">
            너무 많이 틀렸어요. {remainingSeconds}초 후 다시 시도해 주세요.
          </p>
        ) : (
          error && <p className="text-sm text-red-700">{error}</p>
        )}
        <button
          type="submit"
          disabled={disabled}
          className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          입장하기
        </button>
      </form>
    </div>
  )
}
