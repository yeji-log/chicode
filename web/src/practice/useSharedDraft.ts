import { useCallback, useEffect, useState } from 'react'

import { showToast } from '../components/Toast'
import {
  addSave,
  loadSaves,
  removeSave,
  renameSave,
  STASH_NAME,
  type SavedDraft,
} from './draftStore'
import {
  buildShareUrl,
  decodeShare,
  readShareToken,
  stripShareToken,
  type PracticeKind,
  type SharePayload,
} from './shareLink'

/** 이번 코드(+회로)의 지금 상태 — 페이지가 에디터/캔버스에서 뽑아서 넘긴다. */
export interface DraftContent {
  code: string
  stdin?: string
  circuit?: SharePayload['circuit']
}

/** 링크로 들어왔는데 이 화면과 종류가 안 맞는 경우(파이썬 링크를 C 화면에서 연 것). */
export interface ShareMismatch {
  token: string
  kind: PracticeKind
}

export interface UseSharedDraft {
  saves: SavedDraft[]
  /** 지금 내용을 보관함에 새로 저장(같은 이름이 있으면 교체). */
  save: (content: DraftContent, name: string) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  /** 덮어쓰기 직전, 지금 내용을 '불러오기 전 코드' 한 칸에 백업한다. */
  stash: (content: DraftContent) => void
  /** 공유 링크를 만들어 클립보드에 복사한다. copied=false 면 페이지가 링크를 직접 보여줘야 한다. */
  copyShareLink: (content: DraftContent) => Promise<{ copied: boolean; url: string }>
  /** 링크로 들어온 공유 내용(이 화면과 종류가 맞을 때만). 페이지가 배너로 확인받는다. */
  incoming: SharePayload | null
  dismissIncoming: () => void
  /** 종류가 안 맞는 링크로 들어온 경우. 페이지가 올바른 실습으로 가는 링크를 보여준다. */
  mismatch: ShareMismatch | null
  /** localStorage 저장이 아예 안 되는 브라우저(사파리 프라이빗 모드 등). */
  storageBlocked: boolean
}

export function useSharedDraft(kind: PracticeKind): UseSharedDraft {
  const [saves, setSaves] = useState<SavedDraft[]>(() => loadSaves(kind))
  const [incoming, setIncoming] = useState<SharePayload | null>(null)
  const [mismatch, setMismatch] = useState<ShareMismatch | null>(null)
  const [storageBlocked, setStorageBlocked] = useState(false)

  // 링크로 들어왔는지 확인한다. 주소창에서 해시만 바꿔 붙여넣는 경우(문서를 다시
  // 로드하지 않음)도 있어서 hashchange 도 같이 듣는다.
  useEffect(() => {
    let cancelled = false

    const check = () => {
      const token = readShareToken()
      if (!token) {
        setIncoming(null)
        setMismatch(null)
        return
      }
      decodeShare(token).then((payload) => {
        if (cancelled) return
        if (!payload) {
          stripShareToken()
          showToast('공유 링크를 읽을 수 없어요')
          return
        }
        if (payload.kind === kind) {
          // 우리가 소비할 링크다 — 새로고침 때 다시 뜨지 않게 주소에서 지운다.
          stripShareToken()
          setMismatch(null)
          setIncoming(payload)
        } else {
          // 종류가 안 맞으면 토큰을 남겨둔다 — 페이지가 올바른 실습으로 넘길 때 그대로 쓴다.
          setIncoming(null)
          setMismatch({ token, kind: payload.kind })
        }
      })
    }

    check()
    window.addEventListener('hashchange', check)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', check)
    }
  }, [kind])

  const save = useCallback(
    (content: DraftContent, name: string) => {
      const result = addSave(kind, { name, ...content }, { replace: name.trim() || undefined })
      setSaves(result.list)
      if (!result.ok) {
        setStorageBlocked(true)
        showToast('이 브라우저에서는 저장이 안 돼요')
      } else {
        showToast('보관함에 저장했어요')
      }
    },
    [kind],
  )

  const stash = useCallback(
    (content: DraftContent) => {
      if (!content.code.trim()) return
      // 이미 같은 코드가 보관함에 있으면 굳이 백업하지 않는다.
      if (saves.some((s) => s.code === content.code)) return
      const result = addSave(kind, { name: STASH_NAME, ...content }, { replace: STASH_NAME })
      setSaves(result.list)
      if (!result.ok) setStorageBlocked(true)
    },
    [kind, saves],
  )

  const remove = useCallback(
    (id: string) => {
      setSaves(removeSave(kind, id))
    },
    [kind],
  )

  const rename = useCallback(
    (id: string, name: string) => {
      setSaves(renameSave(kind, id, name))
    },
    [kind],
  )

  const copyShareLink = useCallback(
    async (content: DraftContent) => {
      const url = await buildShareUrl({
        v: 1,
        kind,
        code: content.code,
        stdin: content.stdin,
        circuit: content.circuit,
      })
      try {
        await navigator.clipboard.writeText(url)
        showToast('공유 링크를 복사했어요')
        return { copied: true, url }
      } catch {
        // 클립보드가 막힌 환경 — 페이지가 링크를 입력칸으로 보여준다.
        return { copied: false, url }
      }
    },
    [kind],
  )

  return {
    saves,
    save,
    remove,
    rename,
    stash,
    copyShareLink,
    incoming,
    dismissIncoming: () => setIncoming(null),
    mismatch,
    storageBlocked,
  }
}
