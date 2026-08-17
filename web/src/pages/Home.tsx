import { Link } from 'react-router-dom'

import { asset } from '../lib/asset'

export default function Home() {
  return (
    <div className="flex flex-col gap-12 py-4">
      <section className="-mx-5 overflow-hidden sm:relative sm:mx-0 sm:rounded-3xl">
        {/*
          hero-desk.webp 는 왼쪽이 완전 투명으로 서서히 사라지도록 미리 만들어진
          그림이다. 우리가 CSS 로 마스크를 흉내 내는 대신 그림 자체의 알파 채널이
          배경과 이어 붙이는 일을 다 해준다.

          이미지 비율(3:2)과 정확히 같은 aspect-[3/2] 를 모바일 기본값으로 두면
          잘리는 부분 없이 그림 전체가 그대로 줄어들어 보인다 — 좁은 화면에서 글과
          겹치지 않도록 그림을 위, 글을 아래로 쌓는 편이 오려서 겹치는 것보다 낫다.
          sm 이상에서만 절대 배치로 바꿔 글 뒤에 넓게 깔고 오른쪽을 기준으로 자른다.
        */}
        <img
          src={asset('hero-desk.webp')}
          alt=""
          aria-hidden="true"
          className="aspect-[3/2] w-full object-cover object-right sm:absolute sm:inset-0 sm:-z-10 sm:aspect-auto sm:h-full"
        />

        <div className="flex max-w-xl flex-col items-start gap-5 px-5 py-8 sm:min-h-[480px] sm:justify-center sm:px-8 sm:py-14">
          <span className="rounded-full bg-cheese-100 px-3 py-1 text-sm font-semibold text-cheese-600">
            Learn · Teach · Grow
          </span>

          <h1 className="font-display text-4xl leading-tight tracking-tight text-ink-900 sm:text-5xl">
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
