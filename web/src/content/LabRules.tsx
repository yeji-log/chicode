const RULES = [
  '음식물을 절대 반입하지 않기',
  '교과서와 필기도구 준비하기',
  '바른 옷차림과 자세로 수업에 참여하기',
  '비품을 파손하지 않도록 주의하기',
  '고장난 컴퓨터는 선생님께 말씀 드리기',
  '불법 소프트웨어·게임 등 프로그램 설치 금지',
  '사용 후 뒷정리 깨끗이 — 의자 넣고 퇴실',
  '선생님보다 먼저 자리에 앉아있기',
  '바른말, 고운말 사용',
]

const IMMEDIATE_PENALTY_RULES = [
  '휴대폰·이어폰 등 수업과 무관한 전자기기 사용',
  '수업과 무관한 소프트웨어 사용 (유튜브·인스타·게임 등)',
]

/**
 * 컴퓨터실 이용규칙 — 실제 학교 규정을 그대로 옮긴 내용이라 문구를 다듬지 않았다.
 *
 * 개인정보처리방침·이용약관과 달리 조항식 법률 문서가 아니라 교실 벽에 붙은
 * 게시물에 가깝다. 그래서 PolicyArticle(제N조 스타일)을 쓰지 않고, "3회 적발 시
 * 벌점"과 "경고 없이 즉시 벌점" 두 문구가 실제로 경고로 읽히도록 이 콘텐츠에서만
 * 쓰는 색(warn-*)과 레이아웃을 새로 짰다.
 */
export default function LabRules() {
  return (
    <>
      <p className="mb-5 text-sm leading-relaxed text-ink-700">
        아래 수칙은 컴퓨터실 이용 규정입니다. 실습을 시작하기 전에 꼭 확인하세요.
      </p>

      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-warn-100 px-3 py-1.5 text-sm font-bold text-warn-600">
        <span aria-hidden="true">⚠️</span>
        3회 적발 시 벌점
      </div>

      <ol className="mb-5 space-y-2.5">
        {RULES.map((rule, i) => (
          <li key={rule} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-900">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-cheese-200 text-xs font-bold text-ink-900">
              {i + 1}
            </span>
            {rule}
          </li>
        ))}
      </ol>

      <div className="rounded-xl bg-board px-4 py-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-warn-300">
          <span aria-hidden="true">⚠️</span>
          경고 없이 즉시 벌점 &amp; 1주 압수
        </p>
        <ul className="space-y-1.5 text-sm leading-relaxed text-cream">
          {IMMEDIATE_PENALTY_RULES.map((rule) => (
            <li key={rule} className="flex gap-2">
              <span aria-hidden="true" className="text-warn-300">
                ·
              </span>
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
