import FeatureCard from '../components/FeatureCard'

/** 실습 탭의 첫 화면. Python / C언어 / Pico 2 W 중 무엇을 할지 고른다. */
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
          가상 Pico 2 W 보드에 LED와 버튼을 연결하고
          <br />
          코드로 직접 동작을 확인해 보세요.
        </FeatureCard>
      </div>
    </div>
  )
}
