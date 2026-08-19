import FeatureCard from '../components/FeatureCard'

/**
 * 실습 탭의 첫 화면. Python 과 Pico 2 W 중 무엇을 할지 고른다.
 *
 * Pico 는 아직 만들지 않았다 — 카드를 아예 숨기는 대신, 눌러도 되는 카드로 두고
 * 눌렀을 때 "준비 중"임을 솔직히 알려준다(/practice/pico, ComingSoon).
 */
export default function Practice() {
  return (
    <div className="flex flex-col gap-8 py-4">
      <header>
        <h1 className="font-display text-2xl tracking-tight text-ink-900">실습</h1>
        <p className="text-sm text-ink-500">무엇을 실습해 볼까요?</p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard to="/practice/python" emoji="🐍" title="Python">
          웹 브라우저에서 바로 Python 코드를
          <br />
          작성하고 실행 결과를 확인해 보세요.
        </FeatureCard>
        <FeatureCard to="/practice/c" emoji="⚙️" title="C언어">
          웹 브라우저에서 바로 C 코드를
          <br />
          작성하고 컴파일하여 실행해 보세요.
        </FeatureCard>
        <FeatureCard to="/practice/pico" emoji="🔌" title="Pico 2 W">
          가상 보드로 GPIO, LED, 버튼을 직접 다뤄보세요.
          <br />
          곧 만나볼 수 있어요.
        </FeatureCard>
      </div>
    </div>
  )
}
