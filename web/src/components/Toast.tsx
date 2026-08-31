import { useEffect, useState } from 'react'

/**
 * 화면 아래에 잠깐 떴다 사라지는 알림. "링크를 복사했어요" 처럼 결과만 알리면
 * 되는 곳에 쓴다 — 모달은 과하고, alert() 는 일부 아이패드 웹뷰에서 조용히
 * 무시된다(CircuitCanvas 의 confirm 관련 주석과 같은 이유).
 *
 * ToastHost 를 App.tsx 에 한 번만 두고, 아무 데서나 showToast() 를 부른다.
 */

type ToastItem = { id: number; message: string }

let emit: ((message: string) => void) | null = null

export function showToast(message: string): void {
  emit?.(message)
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    emit = (message: string) => {
      const id = Date.now() + Math.random()
      setItems((prev) => [...prev, { id, message }])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id))
      }, 2800)
    }
    return () => {
      emit = null
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto max-w-sm rounded-xl bg-ink-900/90 px-4 py-2.5 text-center text-sm font-semibold text-cream shadow-lg"
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
