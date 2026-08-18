import { useState } from 'react'

/**
 * Lab 활동의 "코드" 섹션 전용 표시. 다른 섹션(목표·실습 등)은 그냥 문단이라
 * whitespace-pre-wrap 텍스트로 충분한데, 코드는 (1) 프로즈와 한눈에 구분되고
 * (2) 학생이 그대로 옮겨 칠 수 있어야 해서 별도 컴포넌트로 뺐다.
 * 상단 바(라벨 + 복사 버튼)를 둔 건 흔한 코드 블록 UI 관례를 따른 것 — 이미
 * 실습(PythonLab/CLab)에서도 에디터가 그런 형태라 사이트 안에서 낯설지 않다.
 */
export default function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드 API 가 막힌 환경(권한 거부 등)일 수 있다 — 조용히 무시,
      // 학생은 그냥 직접 드래그해서 복사하면 된다.
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-cream-deep">
      <div className="flex items-center justify-between bg-ink-900 px-4 py-2">
        <span className="text-xs font-semibold tracking-wide text-cream/60 uppercase">code</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md px-2 py-1 text-xs font-semibold text-cream/80 transition-colors hover:bg-white/10 hover:text-cream"
        >
          {copied ? '복사됨 ✓' : '복사'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-ink-900 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-cream">
        <code>{code}</code>
      </pre>
    </div>
  )
}
