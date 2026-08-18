/**
 * 핀번호를 너무 빠르게 반복해서 틀리는 걸 늦추는 클라이언트 쪽 감속 장치.
 *
 * 진짜 브루트포스 방어는 아니다 — 학생은 로그인이 없고 서버 함수도 없어서
 * (Cloud Functions는 Blaze 유료 플랜이 필요해 "서버비용 0원" 원칙과 충돌)
 * 시도 횟수를 서버가 세는 건 애초에 불가능하다. sessionStorage에 "몇 번
 * 틀렸는지"를 기억해뒀다가, 5번 틀릴 때마다 잠그는 시간을 30초→1분→2분→
 * 5분(상한)으로 점점 늘려서 무작정 숫자를 연타하는 걸 비효율적으로 만드는
 * 정도다. devtools로 sessionStorage를 지우면 우회된다 — subjects.ts에 이미
 * 적혀 있는 "가벼운 잠금" 트레이드오프와 같은 성격이라 받아들인다.
 *
 * 잠금 임계값(5번)에 못 미쳐도 실패할 때마다 짧게(0.5초) 다시 제출을 막는다
 * — 엔터 연타로 순식간에 여러 번 찍어보는 것 자체를 막는 최소한의 보완이다.
 *
 * 과목별 수업자료, Lab처럼 핀 게이트가 여러 곳에 있으므로 storageKey 로
 * 서로 다른 잠금 카운트를 독립적으로 유지한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface ThrottleState {
  failCount: number
  /** 잠금을 몇 번째로 거는지 — LOCK_DURATIONS_MS 인덱스로 쓰여서 잠글 때마다
   *  더 오래 잠기게 한다(상한 도달 후엔 마지막 값 반복). */
  lockTier: number
  lockedUntil: number
}

const EMPTY_STATE: ThrottleState = { failCount: 0, lockTier: 0, lockedUntil: 0 }
const FAILS_PER_LOCK = 5
const LOCK_DURATIONS_MS = [30_000, 60_000, 120_000, 300_000]
const BUSY_MS = 500
const KEY_PREFIX = 'chicode:pin-attempts:'

function loadState(key: string): ThrottleState {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw)
    return {
      failCount: Number(parsed.failCount) || 0,
      lockTier: Number(parsed.lockTier) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    }
  } catch {
    return EMPTY_STATE
  }
}

function saveState(key: string, state: ThrottleState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    // 저장이 안 돼도(예: 시크릿 모드 저장소 제한) 지금 화면 동작엔 지장 없다 —
    // 새로고침하면 카운트가 안 남는 것뿐.
  }
}

export function usePinAttemptThrottle(storageKey: string) {
  const key = KEY_PREFIX + storageKey
  const [state, setState] = useState<ThrottleState>(() => loadState(key))
  const [now, setNow] = useState(() => Date.now())
  const [isBusy, setIsBusy] = useState(false)
  const busyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isLocked = state.lockedUntil > now

  // 잠겨 있는 동안만 1초마다 다시 그려서 카운트다운 문구를 갱신한다.
  useEffect(() => {
    if (!isLocked) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isLocked])

  useEffect(() => {
    return () => {
      if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current)
    }
  }, [])

  const recordFailure = useCallback(() => {
    setState((current) => {
      const failCount = current.failCount + 1
      const next: ThrottleState =
        failCount % FAILS_PER_LOCK === 0
          ? {
              failCount,
              lockTier: current.lockTier + 1,
              lockedUntil: Date.now() + LOCK_DURATIONS_MS[Math.min(current.lockTier, LOCK_DURATIONS_MS.length - 1)],
            }
          : { ...current, failCount }
      saveState(key, next)
      return next
    })

    setIsBusy(true)
    if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current)
    busyTimeoutRef.current = setTimeout(() => setIsBusy(false), BUSY_MS)
  }, [key])

  const reset = useCallback(() => {
    saveState(key, EMPTY_STATE)
    setState(EMPTY_STATE)
  }, [key])

  return {
    /** 5번 단위로 걸리는 진짜 잠금 — 카운트다운(remainingSeconds)과 함께 보여준다. */
    isLocked,
    /** 잠금과 별개로, 방금 틀린 직후 아주 짧게(0.5초) 다시 제출을 막는 상태.
     *  isLocked 처럼 안내 문구를 띄울 필요는 없고 입력만 잠깐 막으면 된다. */
    isBusy,
    remainingSeconds: isLocked ? Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)) : 0,
    recordFailure,
    reset,
  }
}
