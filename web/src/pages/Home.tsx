import { Link } from 'react-router-dom'

import { asset } from '../lib/asset'

export default function Home() {
  return (
    <div className="flex flex-col gap-12 py-4">
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-start gap-5">
          <span className="rounded-full bg-cheese-100 px-3 py-1 text-sm font-semibold text-cheese-600">
            Learn · Teach · Grow
          </span>

          <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-ink-900 sm:text-5xl">
            치즈처럼 즐겁게,
            <br />
            코드처럼 단단하게.
          </h1>

          <p className="max-w-lg text-lg leading-relaxed text-ink-700">
            수업자료를 찾아보고, 브라우저에서 바로 Python을 실행해 보세요. 설치할 것도,
            가입할 것도 없습니다.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/python"
              className="rounded-xl bg-cheese-400 px-5 py-3 font-bold text-ink-900 shadow-sm transition-colors hover:bg-cheese-300"
            >
              Python 실습 시작하기
            </Link>
            <Link
              to="/materials"
              className="rounded-xl border border-cream-deep bg-white/60 px-5 py-3 font-bold text-ink-700 transition-colors hover:border-cheese-300"
            >
              수업자료 보기
            </Link>
          </div>
        </div>

        <img
          src={asset("chicode.png")}
          alt="노트북 앞에 앉은 CHICODE 치즈 캐릭터"
          className="mx-auto w-full max-w-sm drop-shadow-xl"
        />
      </section>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          to="/materials"
          emoji="📚"
          title="수업자료"
          body="선생님이 올린 PDF와 이미지를 웹에서 바로 열어보고 내려받습니다."
        />
        <FeatureCard
          to="/python"
          emoji="🐍"
          title="Python 실습"
          body="코드를 쓰고 실행 버튼만 누르면 됩니다. 결과가 옆 창에 바로 나옵니다."
        />
        <UpcomingCard
          emoji="🔌"
          title="Pico 2 W 시뮬레이터"
          body="가상 보드로 LED와 버튼을 다루는 실습입니다. 다음 단계에서 준비합니다."
        />
      </section>
    </div>
  )
}

function FeatureCard({
  to,
  emoji,
  title,
  body,
}: {
  to: string
  emoji: string
  title: string
  body: string
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6 transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md"
    >
      <span className="text-3xl">{emoji}</span>
      <h2 className="text-lg font-bold text-ink-900">{title}</h2>
      <p className="text-sm leading-relaxed text-ink-700">{body}</p>
      <span className="mt-auto pt-3 text-sm font-semibold text-cheese-600 opacity-0 transition-opacity group-hover:opacity-100">
        들어가기 →
      </span>
    </Link>
  )
}

function UpcomingCard({
  emoji,
  title,
  body,
}: {
  emoji: string
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-cream-deep p-6">
      <span className="text-3xl opacity-50 grayscale">{emoji}</span>
      <h2 className="text-lg font-bold text-ink-500">{title}</h2>
      <p className="text-sm leading-relaxed text-ink-500">{body}</p>
      <span className="mt-auto pt-3 text-sm font-semibold text-ink-500">준비 중</span>
    </div>
  )
}
