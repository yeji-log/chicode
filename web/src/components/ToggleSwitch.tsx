/** 켜고 끄는 상태가 한눈에 보이는 스위치 토글. 체크박스 대신 쓴다 — 텍스트
 *  라벨("공개됨"/"임시저장" 등)은 호출부에서 옆에 같이 보여준다.
 *  TeacherLab.tsx(활동 공개 토글)와 Teacher.tsx(과목 핀 잠금 토글)에서 같이 쓴다. */
export default function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-cheese-400' : 'bg-cream-deep',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block size-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
