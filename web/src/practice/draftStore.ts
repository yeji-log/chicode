/**
 * "내 보관함" — 실습 코드(+회로)를 이름 붙여 여러 벌 저장한다.
 *
 * 그 브라우저의 localStorage 에만 남는다. 계정별/기기 간 동기화는 학생 로그인이
 * 없어 구조상 불가능하다(exercises.ts 머리말과 같은 이유). 컴퓨터를 바꾸면
 * 사라지는 걸 받아들인 결정이고, 잃어버려도 되게 "링크로 공유"(shareLink.ts)가
 * 따로 있다.
 *
 * 실습별로 키 하나에 목록을 통째로 담는다:
 *   chicode.python.saves / chicode.c.saves / chicode.pico.saves
 */
import type { PracticeKind } from './shareLink'
import type { CircuitSnapshot } from '../pico/circuit/types'

export interface SavedDraft {
  id: string
  /** 학생이 붙인 이름. 비우면 저장 시각으로 채운다. */
  name: string
  /** epoch ms. */
  savedAt: number
  code: string
  stdin?: string
  circuit?: CircuitSnapshot
}

/** 자동 저장(현재 코드 한 벌)과 헷갈리지 않게 보관함 키는 `.saves` 로 끝낸다. */
const KEY: Record<PracticeKind, string> = {
  python: 'chicode.python.saves',
  c: 'chicode.c.saves',
  pico: 'chicode.pico.saves',
}

/** 개수 상한. 회로 캔버스의 되돌리기 스택(50)과 같은 방식으로 오래된 것부터 민다. */
const MAX = 20

/** 불러오기 직전 자동 백업에 쓰는 고정 이름 — 매번 새로 쌓지 않고 이 항목을 갈아끼운다. */
export const STASH_NAME = '불러오기 전 코드'

function isValid(value: unknown): value is SavedDraft {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  return typeof d.id === 'string' && typeof d.name === 'string' && typeof d.code === 'string'
}

export function loadSaves(kind: PracticeKind): SavedDraft[] {
  try {
    const raw = localStorage.getItem(KEY[kind])
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValid) : []
  } catch {
    return []
  }
}

/** 용량 초과(사파리 프라이빗 모드 등)면 오래된 것부터 버리고 다시 시도한다. */
function persist(kind: PracticeKind, list: SavedDraft[]): boolean {
  let attempt = [...list]
  for (let i = 0; i < 5; i++) {
    try {
      localStorage.setItem(KEY[kind], JSON.stringify(attempt))
      return true
    } catch {
      if (attempt.length <= 1) return false
      attempt = attempt.slice(0, -1) // 가장 오래된(끝) 항목을 버린다
    }
  }
  return false
}

export interface AddResult {
  ok: boolean
  list: SavedDraft[]
}

export interface AddOptions {
  /** 이 id 또는 이 이름과 정확히 일치하는 기존 항목을 갈아끼운다(새로 추가하지 않음). */
  replace?: string
}

/** 새 항목을 목록 맨 앞에 넣는다(최신이 위). 반환된 list 를 그대로 상태에 반영할 것. */
export function addSave(
  kind: PracticeKind,
  draft: Omit<SavedDraft, 'id' | 'savedAt'>,
  options: AddOptions = {},
): AddResult {
  const now = Date.now()
  const name = draft.name.trim() || new Date(now).toLocaleString('ko-KR', { hour12: false })
  const current = loadSaves(kind)

  const replaceIndex = options.replace
    ? current.findIndex((d) => d.id === options.replace || d.name === options.replace)
    : -1

  let next: SavedDraft[]
  if (replaceIndex >= 0) {
    next = [...current]
    next[replaceIndex] = { ...next[replaceIndex], ...draft, name, savedAt: now }
  } else {
    next = [{ ...draft, name, id: crypto.randomUUID(), savedAt: now }, ...current]
  }
  if (next.length > MAX) next = next.slice(0, MAX)

  const ok = persist(kind, next)
  return { ok, list: ok ? next : current }
}

export function removeSave(kind: PracticeKind, id: string): SavedDraft[] {
  const next = loadSaves(kind).filter((d) => d.id !== id)
  persist(kind, next)
  return next
}

export function renameSave(kind: PracticeKind, id: string, name: string): SavedDraft[] {
  const next = loadSaves(kind).map((d) =>
    d.id === id ? { ...d, name: name.trim() || d.name } : d,
  )
  persist(kind, next)
  return next
}
