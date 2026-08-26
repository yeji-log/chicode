/**
 * 채점 규칙. 화면과 채점 훅이 같은 기준을 쓰도록 여기 한 군데에만 둔다.
 */

/**
 * 출력을 비교하기 전에 다듬는다.
 *
 * 봐주는 것은 딱 세 가지다 — 줄 끝의 공백, 맨 끝의 빈 줄, 그리고 줄바꿈 표기(\r\n).
 * 학생이 어쩔 수 없이 만들어내는 차이(에디터가 붙이는 개행 등)만 흡수하고,
 * 나머지는 글자 그대로 비교한다. 여기서 공백을 전부 지우는 식으로 관대해지면
 * 구구단(`3 x 1 = 3`)이나 피라미드처럼 공백 자체가 답인 문제를 낼 수 없게 된다.
 */
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

export function outputMatches(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected)
}

/**
 * `input("숫자를 입력하세요>> ")` 처럼 안내 문구를 넣었는지 본다.
 *
 * 수업 노트북이 전부 이 스타일이라 학생들이 그대로 따라 쓰는데, 그 문구도 출력에
 * 섞여 나가서 계산이 맞아도 오답이 된다. 채점이 틀렸을 때 이걸 먼저 짚어주지 않으면
 * "분명히 맞는데 왜 틀리냐"로 수업이 멈춘다 — 실제로 가장 흔할 실패 원인이라
 * 따로 감지한다.
 *
 * 출력만 봐서는 프롬프트인지 학생이 일부러 찍은 글자인지 구분할 수 없어서,
 * 코드 쪽에서 찾는다.
 */
export function usesInputPrompt(code: string): boolean {
  return /\binput\s*\(\s*['"]/.test(code)
}
