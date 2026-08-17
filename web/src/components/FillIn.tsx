/** 아직 값이 정해지지 않은 자리를 눈에 띄게 표시한다 (예: 담당자 연락처). */
export default function FillIn({ children }: { children: string }) {
  return (
    <span className="rounded bg-cheese-100 px-1.5 py-0.5 font-semibold text-cheese-600">
      {children}
    </span>
  )
}
