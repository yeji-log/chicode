import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-python'

/**
 * Lab 활동의 "코드" 필드는 교사가 textarea에 그냥 붙여넣는 자유 텍스트라
 * 언어를 따로 고르지 않는다. 지금까지 실제로 들어온 활동은 전부 Arduino
 * (C++ 계열)이고, 사이트 다른 곳(실습 탭)이 Python도 다루니 Python도
 * 감지 대상에 넣었다 — 그 외 언어는 지원 범위 밖이라고 보고 cpp 문법으로
 * 대충이라도 강조되게 fallback 시킨다(색이 하나도 안 입는 것보단 낫다).
 * 언어가 늘어나면 활동에 언어 선택 필드를 추가하는 게 맞고, 이 추측은
 * 그 전까지만 쓰는 임시 방편이다.
 */
function detectLanguage(code: string): 'python' | 'cpp' {
  const looksLikePython = /(^|\n)\s*(def\s+\w+\s*\(.*\)\s*:|import\s+\w+)/.test(code)
  const looksLikeCFamily = /[;{}]/.test(code)
  return looksLikePython && !looksLikeCFamily ? 'python' : 'cpp'
}

/** Prism 이 만든 HTML 문자열을 돌려준다 — 코드 안의 <, &, > 는 Prism이 이미
 *  이스케이프하므로 CodeBlock에서 dangerouslySetInnerHTML로 그대로 써도 된다. */
export function highlightCode(code: string): string {
  const lang = detectLanguage(code)
  const grammar = lang === 'python' ? Prism.languages.python : Prism.languages.cpp
  return Prism.highlight(code, grammar, lang)
}
