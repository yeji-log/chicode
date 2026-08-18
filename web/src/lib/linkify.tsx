import type { ReactNode } from 'react'

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g

/**
 * 교사가 자유 텍스트(활동의 "실습", "Mission" 등)에 URL을 그냥 타이핑해 넣는
 * 경우가 많아서, 렌더링할 때 URL만 찾아 클릭 가능한 링크로 바꿔준다.
 * 코드 블록(CodeBlock)에는 적용하지 않는다 — 코드 안의 문자열/주석이 링크로
 * 바뀌면 오히려 읽기 어려워진다.
 */
export function linkify(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="text-cheese-600 underline decoration-cheese-300 underline-offset-2 hover:text-cheese-700"
      >
        {part}
      </a>
    ) : (
      part
    ),
  )
}
