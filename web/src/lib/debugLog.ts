/**
 * 임시 진단 도구.
 *
 * 갤럭시 탭에서 교사 로그인·발표 화면이 실패하는데, 개발자도구 없이는 원인을
 * 볼 방법이 없어서 넣었다. console.error 대신(또는 같이) 여기 쌓아두면
 * DebugPanel.tsx 가 화면에 그대로 보여주고 복사까지 할 수 있게 한다.
 *
 * 원인이 확인되고 나면 이 파일과 DebugPanel.tsx, 그리고 AuthProvider.tsx·
 * PdfViewer.tsx 에 넣은 pushDebug 호출들을 지워도 된다 — 정식 기능이 아니라
 * 이번 조사를 위한 임시 도구다.
 */
export type DebugEntry = { time: string; label: string; detail: string }

const entries: DebugEntry[] = []
const listeners = new Set<() => void>()

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    const withCode = value as Error & { code?: string }
    return JSON.stringify(
      { name: value.name, message: value.message, code: withCode.code, stack: value.stack },
      null,
      2,
    )
  }
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function pushDebug(label: string, detail?: unknown): void {
  const time = new Date().toTimeString().slice(0, 8)
  entries.push({ time, label, detail: detail === undefined ? '' : safeStringify(detail) })
  if (entries.length > 300) entries.shift()
  listeners.forEach((fn) => fn())
}

export function getDebugEntries(): DebugEntry[] {
  return entries
}

export function subscribeDebug(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * ?debug=1 로 들어오면 그 이후로는 세션 동안 계속 켜둔다 — 로그인 화면과
 * 발표(수업자료) 화면을 오가며 테스트해야 하는데, 페이지 이동마다 쿼리
 * 문자열을 다시 붙이게 하고 싶지 않아서다.
 */
export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (new URLSearchParams(window.location.search).get('debug') === '1') {
      sessionStorage.setItem('chicode-debug', '1')
    }
    return sessionStorage.getItem('chicode-debug') === '1'
  } catch {
    return false
  }
}

// 여기서 못 잡은 오류(전혀 다른 원인일 가능성 포함)까지 놓치지 않으려고
// 전역으로도 걸어둔다.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    pushDebug('전역 오류', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    pushDebug('처리 안 된 Promise 거부', event.reason)
  })
}
