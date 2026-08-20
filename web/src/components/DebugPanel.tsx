import { useEffect, useState } from 'react'

import { clearDebugEntries, getDebugEntries, isDebugEnabled, subscribeDebug } from '../lib/debugLog'

/**
 * 임시 진단 패널. URL에 ?debug=1 을 붙였을 때만 화면 구석에 작은 버튼으로
 * 나타난다 — 실제 학생/교사 화면을 어지럽히지 않으려고 기본은 숨김이다.
 *
 * 발표 전체화면 오버레이(LabPresentationOverlay, z-50) 위에서도 눌러야 해서
 * z-index를 그보다 훨씬 높게 둔다. debugLog.ts 설명 참고 — 원인이 확인되면
 * 이 파일 자체를 지워도 된다.
 */
export default function DebugPanel() {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setEnabled(isDebugEnabled())
  }, [])

  useEffect(() => subscribeDebug(() => setTick((t) => t + 1)), [])

  if (!enabled) return null

  const deviceInfo = collectDeviceInfo()
  const entries = getDebugEntries()
  const fullText = buildReportText(deviceInfo, entries)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 일부 브라우저는 클립보드 API 권한이 없다 — 대신 전체 선택해서
      // 직접 복사할 수 있게 textarea 하나를 띄운다.
      const el = document.getElementById('chicode-debug-textarea') as HTMLTextAreaElement | null
      el?.focus()
      el?.select()
    }
  }

  return (
    <div className="fixed bottom-3 left-3 z-[9999]" data-tick={tick}>
      {open ? (
        <div className="flex max-h-[70vh] w-[min(92vw,420px)] flex-col gap-2 overflow-hidden rounded-xl border border-cream-deep bg-white p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink-900">🔧 진단 정보</span>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="rounded-md bg-cheese-400 px-2.5 py-1 text-xs font-bold text-ink-900"
              >
                {copied ? '복사됨!' : '전체 복사'}
              </button>
              <button
                onClick={clearDebugEntries}
                className="rounded-md border border-cream-deep px-2.5 py-1 text-xs font-semibold text-ink-700"
              >
                지우기
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-cream-deep px-2.5 py-1 text-xs font-semibold text-ink-700"
              >
                닫기
              </button>
            </div>
          </div>
          <textarea
            id="chicode-debug-textarea"
            readOnly
            value={fullText}
            className="h-64 w-full flex-1 resize-none rounded-md border border-cream-deep bg-cream/40 p-2 font-mono text-[10px] leading-tight text-ink-900"
          />
          <p className="text-[10px] text-ink-500">
            "전체 복사" 눌러서 복사한 뒤 붙여넣어 보내주세요. 복사가 안 되면 위 글상자를 길게 눌러
            직접 선택해서 복사할 수 있어요.
          </p>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-ink-900 px-3 py-2 text-xs font-bold text-white shadow-lg"
        >
          🔧 진단 ({entries.length})
        </button>
      )}
    </div>
  )
}

function collectDeviceInfo(): Record<string, string> {
  const safeMatchMedia = (query: string) => {
    try {
      return String(matchMedia(query).matches)
    } catch (caught) {
      return `오류: ${caught}`
    }
  }
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: String(navigator.maxTouchPoints),
    'pointer: coarse': safeMatchMedia('(pointer: coarse)'),
    'pointer: fine': safeMatchMedia('(pointer: fine)'),
    'hover: hover': safeMatchMedia('(hover: hover)'),
    devicePixelRatio: String(window.devicePixelRatio),
    innerWidth_x_innerHeight: `${window.innerWidth} x ${window.innerHeight}`,
    screen_width_x_height: `${screen.width} x ${screen.height}`,
    location_href: location.href,
  }
}

function buildReportText(deviceInfo: Record<string, string>, entries: ReturnType<typeof getDebugEntries>): string {
  const deviceLines = Object.entries(deviceInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  const logLines = entries.length
    ? entries.map((e) => `[${e.time}] ${e.label}${e.detail ? `\n${e.detail}` : ''}`).join('\n\n')
    : '(아직 기록된 로그 없음 — 로그인 시도나 발표 시작을 해보세요)'
  return `=== 기기 정보 ===\n${deviceLines}\n\n=== 로그 ===\n${logLines}`
}
