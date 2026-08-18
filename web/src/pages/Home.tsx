import { Link } from 'react-router-dom'

import FeatureCard from '../components/FeatureCard'
import { asset } from '../lib/asset'

export default function Home() {
  return (
    <div className="flex flex-col gap-12 py-4">
      <section className="relative sm:min-h-[540px]">
        {/*
          hero-desk.webp 는 왼쪽이 완전 투명으로 서서히 사라지도록 미리 만들어진
          그림이다. 우리가 CSS 로 마스크를 흉내 내는 대신 그림 자체의 알파 채널이
          배경과 이어 붙이는 일을 다 해준다.

          카드처럼 둥근 테두리로 박스를 쳐서 오려내면(rounded + overflow-hidden)
          크림색 페이지 위에 사각형 하나가 얹힌 것처럼 보인다. 테두리를 없애 페이지
          배경이 캐릭터·책상까지 끊김 없이 이어지게 한다.

          캐릭터를 키우면서도 아래 카드 영역을 침범하면 안 되므로, 세로/가로를
          다른 규칙으로 다룬다 — 안쪽 래퍼는 높이를 섹션과 똑같이 고정하고 자신의
          overflow-hidden 으로 세로 방향은 절대 넘치지 않게 막는다. 그 래퍼 자체의
          너비만 섹션보다 넓게 잡아 오른쪽으로 삐져나가게 하고, 그 삐져나온 부분은
          섹션(overflow 기본값 visible)을 그대로 통과해 body 의 overflow-x: hidden
          에서만 화면 끝에 잘린다 — 그래서 세로는 절대 안전하고 가로만 살짝 넘친다.

          이미지 비율(3:2)과 정확히 같은 aspect-[3/2] 를 모바일 기본값으로 두면
          잘리는 부분 없이 그림 전체가 그대로 줄어들어 보인다 — 좁은 화면에서 글과
          겹치지 않도록 그림을 위, 글을 아래로 쌓는 편이 오려서 겹치는 것보다 낫다.
        */}
        <div className="sm:absolute sm:inset-y-0 sm:left-0 sm:-right-[7%] sm:-z-10 sm:overflow-hidden">
          <img
            src={asset('hero-desk.webp')}
            alt=""
            aria-hidden="true"
            className="aspect-[3/2] w-full object-cover object-right sm:aspect-auto sm:h-full"
          />
        </div>

        <div className="flex max-w-xl flex-col items-start gap-5 px-5 py-8 sm:min-h-[540px] sm:justify-center sm:px-8 sm:py-14">
          <span className="rounded-full bg-cheese-100 px-3 py-1 text-sm font-semibold text-cheese-600">
            Learn · Teach · Grow
          </span>

          <h1 className="font-display text-4xl leading-tight tracking-tight text-ink-900 sm:text-5xl">
            치즈처럼 즐겁게,
            <br />
            코드처럼 단단하게.
          </h1>

          <p className="max-w-lg text-lg leading-relaxed text-ink-700">
            배우고, 직접 만들고, 새로운 것을 발견해 보세요.
            <br />
            수업자료부터 코딩 실습, 프로젝트까지 CHICODE에서 바로 시작할 수 있습니다.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/practice"
              className="rounded-xl bg-cheese-400 px-5 py-3 font-bold text-ink-900 shadow-sm transition-colors hover:bg-cheese-300"
            >
              실습 시작하기
            </Link>
            <Link
              to="/materials"
              className="rounded-xl border border-cream-deep bg-white/60 px-5 py-3 font-bold text-ink-700 transition-colors hover:border-cheese-300"
            >
              수업자료 보기
            </Link>
            <Link
              to="/news"
              className="rounded-xl border border-cream-deep bg-white/60 px-5 py-3 font-bold text-ink-700 transition-colors hover:border-cheese-300"
            >
              🔥 오늘의 AI·IT 이슈
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard to="/materials" emoji="📚" title="수업자료">
          선생님이 준비한 수업자료를
          <br />
          웹에서 바로 확인하고 학습해 보세요.
        </FeatureCard>
        <FeatureCard to="/practice" emoji="💻" title="실습">
          Python부터 C언어, Pico 2 W까지
          <br />
          직접 코드를 작성하고 실행해 보세요.
        </FeatureCard>
        <FeatureCard to="/projects" emoji="🚀" title="프로젝트">
          배운 내용을 직접 활용해
          <br />
          나만의 작품과 프로젝트를 만들어 보세요.
        </FeatureCard>
      </section>
    </div>
  )
}
