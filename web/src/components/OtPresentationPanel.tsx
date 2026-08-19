import { useEffect, useState } from 'react'

import {
  addOtPresentation,
  removeOtPresentation,
  renameOtPresentation,
  type OtPresentationMeta,
  type SubjectMeta,
} from '../lib/subjects'
import { SlidesPanel } from '../pages/LabBoardEditor'
import { deleteSlidePdf, deleteSlidePptx } from '../lib/labSlides'

/**
 * 교사 페이지 OT 탭 전용 "OT 자료" 목록 — 항목을 여러 개 추가할 수 있고
 * (예: 1차시/2차시 자료를 따로 두는 식), 항목마다 독립적으로 PPT/PDF를
 * 첨부·교체·삭제할 수 있다. 실제 업로드·저장 로직은 SlidesPanel(Lab 활동
 * 편집기와 공용)을 그대로 재사용한다 — activityId 문자열 하나로만 동작해서
 * "활동" 데이터 모델 없이도 그대로 붙는다.
 *
 * 목록 자체(제목)는 subjects/{subjectId}.otPresentations 배열에 있고, 항목별
 * 실제 PPT/PDF는 각자 자기 id로 된 labSlides 문서에 있다(id는
 * crypto.randomUUID() — 다른 곳의 활동 id와 겹칠 일이 없다).
 *
 * 미리보기·"발표 시작"은 여기 없다 — 첨부만 담당하고, 실제 보여주기/발표는
 * 수업자료 OT 페이지(SubjectMaterials.tsx의 OtMaterialsList)에서 교사
 * 로그인 상태로만 할 수 있게 옮겼다(그래야 첨부 화면과 발표 화면이 같은
 * "학생이 실제로 보는 화면"을 공유해서, 교사가 여기서 미리 보던 것과 실제
 * 발표 때 학생이 보는 게 서로 달라질 일이 없다).
 */
export default function OtPresentationPanel({
  subject,
  onSubjectChange,
}: {
  subject: SubjectMeta
  onSubjectChange: (patch: Partial<SubjectMeta>) => void
}) {
  const items = subject.otPresentations ?? []
  const [busy, setBusy] = useState(false)

  async function handleAdd() {
    setBusy(true)
    try {
      const entry = await addOtPresentation(subject.id, `OT 자료 ${items.length + 1}`)
      onSubjectChange({ otPresentations: [...items, entry] })
    } catch (caught) {
      console.error('OT 자료 추가 실패', caught)
      alert('OT 자료를 추가하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(entry: OtPresentationMeta) {
    if (!confirm(`"${entry.title}"를 삭제할까요? 업로드한 PPT/PDF도 함께 삭제됩니다.`)) return
    try {
      await removeOtPresentation(subject.id, entry.id)
      // labSlides 문서 자체(대본)는 Lab의 deleteActivity와 같은 이유로 안
      // 지운다(subjects.ts의 removeOtPresentation 주석 참고) — 용량을 크게
      // 차지하는 PPT/PDF 원본만 확실히 지운다.
      await Promise.all([deleteSlidePptx(entry.id), deleteSlidePdf(entry.id)])
      onSubjectChange({ otPresentations: items.filter((item) => item.id !== entry.id) })
    } catch (caught) {
      console.error('OT 자료 삭제 실패', caught)
      alert('OT 자료를 삭제하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  async function handleRename(entry: OtPresentationMeta, title: string) {
    // 낙관적으로 먼저 반영 — 실패해도 다음에 다시 고치면 되는 사소한 텍스트라
    // SubjectSettings처럼 저장 버튼/에러 문구까지 둘 정도는 아니라고 판단했다.
    onSubjectChange({
      otPresentations: items.map((item) => (item.id === entry.id ? { ...item, title } : item)),
    })
    try {
      await renameOtPresentation(subject.id, entry.id, title)
    } catch (caught) {
      console.error('OT 자료 이름 변경 실패', caught)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-cream-deep bg-white/70 p-6">
      <div>
        <h2 className="font-bold text-ink-900">🎤 OT 자료</h2>
        <p className="mt-1 text-xs text-ink-500">
          여기 올린 PPT는 학생 화면 OT 탭에도 그대로 보입니다. OT 자료를 여러 개 추가해서(예:
          1차시/2차시) 각각 따로 관리할 수 있어요. 발표(슬라이드+대본 나란히, 실시간 진행)는 여기가
          아니라 학생과 같은 화면인 수업자료 OT 페이지에서 교사 로그인 상태로 시작할 수 있습니다.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-cream-deep px-4 py-8 text-center text-sm text-ink-500">
          아직 추가한 OT 자료가 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((entry) => (
            <OtPresentationItem
              key={entry.id}
              entry={entry}
              onRename={(title) => handleRename(entry, title)}
              onRemove={() => handleRemove(entry)}
            />
          ))}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={busy}
        className="self-start rounded-xl border border-cream-deep px-4 py-2 text-sm font-bold text-ink-700 transition-colors hover:border-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '추가하는 중…' : '+ OT 자료 추가'}
      </button>
    </div>
  )
}

/** OT 자료 하나 — 제목 인라인 수정 + 첨부(SlidesPanel)만 담당한다. 미리보기·
 *  발표 기능은 없다(위 OtPresentationPanel 주석 참고). entry.id 를 그대로
 *  labSlides 문서 id로 쓴다. */
function OtPresentationItem({
  entry,
  onRename,
  onRemove,
}: {
  entry: OtPresentationMeta
  onRename: (title: string) => void
  onRemove: () => void
}) {
  const [titleDraft, setTitleDraft] = useState(entry.title)

  useEffect(() => {
    setTitleDraft(entry.title)
  }, [entry.title])

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-cream-deep bg-cream/40 p-4">
      <div className="flex items-center gap-2">
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => {
            const trimmed = titleDraft.trim() || 'OT 자료'
            setTitleDraft(trimmed)
            if (trimmed !== entry.title) onRename(trimmed)
          }}
          className="min-w-0 flex-1 rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-sm font-bold text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
        <button
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
        >
          삭제
        </button>
      </div>

      <SlidesPanel activityId={entry.id} />
    </div>
  )
}
