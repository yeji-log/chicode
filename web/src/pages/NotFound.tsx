import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <img src="/chicode.png" alt="" className="size-28 rounded-full opacity-80" />
      <h1 className="text-2xl font-extrabold text-ink-900">페이지를 찾을 수 없습니다</h1>
      <p className="text-ink-700">주소를 다시 확인해 주세요.</p>
      <Link
        to="/"
        className="rounded-xl bg-cheese-400 px-5 py-3 font-bold text-ink-900 hover:bg-cheese-300"
      >
        홈으로
      </Link>
    </div>
  )
}
