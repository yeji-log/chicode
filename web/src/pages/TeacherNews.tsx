import { useEffect, useState } from 'react'

import {
  CATEGORY_LABELS,
  CATEGORY_LIST,
  discardCandidate,
  deleteNewsIssue,
  formatRelativeTime,
  listCandidates,
  listPublishedNews,
  publishNews,
  updateNewsIssue,
  type NewsCandidate,
  type NewsCategory,
  type NewsIssue,
} from '../lib/news'

/**
 * 교사 페이지의 "오늘의 뉴스" 탭.
 *
 * newsCandidates 는 GitHub Actions가 매일 아침 자동으로 채워둔 원문 후보다(요약도
 * "왜 중요한가"도 없다). 교사가 그중 몇 개를 골라 직접 문장을 써서 승인해야만
 * 학생 홈 화면에 뜬다 — LLM 요약 없이 무료로 운영하기로 한 대신 이 판단은 사람이
 * 한다는 게 이 화면의 존재 이유다.
 */
export default function TeacherNews({ teacherEmail }: { teacherEmail: string }) {
  const [candidates, setCandidates] = useState<NewsCandidate[]>([])
  const [published, setPublished] = useState<NewsIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPublishedId, setEditingPublishedId] = useState<string | null>(null)

  async function refresh() {
    const [nextCandidates, nextPublished] = await Promise.all([
      listCandidates(),
      listPublishedNews(10),
    ])
    setCandidates(nextCandidates)
    setPublished(nextPublished)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleDiscard(candidateId: string) {
    await discardCandidate(candidateId)
    setCandidates((list) => list.filter((item) => item.id !== candidateId))
  }

  async function handlePublish(candidate: NewsCandidate, fields: PublishFormValues) {
    await publishNews(
      candidate.id,
      {
        title: fields.title,
        summary: fields.summary,
        whyImportant: fields.whyImportant,
        category: fields.category,
        keywords: fields.keywords,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.sourceUrl,
        publishedAt: candidate.publishedAt,
      },
      teacherEmail,
    )
    setEditingId(null)
    await refresh()
  }

  async function handleUnpublish(issueId: string) {
    if (!confirm('이 이슈를 학생 화면에서 내릴까요?')) return
    await deleteNewsIssue(issueId)
    setPublished((list) => list.filter((issue) => issue.id !== issueId))
  }

  async function handleUpdate(issueId: string, fields: PublishFormValues) {
    await updateNewsIssue(issueId, {
      title: fields.title,
      summary: fields.summary,
      whyImportant: fields.whyImportant,
      category: fields.category,
      keywords: fields.keywords,
    })
    setEditingPublishedId(null)
    await refresh()
  }

  if (loading) return <p className="text-ink-500">뉴스 후보를 불러오는 중…</p>

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-bold text-ink-900">검토 대기 후보 ({candidates.length})</h2>
          <p className="text-sm text-ink-500">
            매일 아침 자동으로 모인 원문입니다. 3~5개를 골라 요약과 "왜 중요한가"를 직접 쓰고
            승인해야 학생 화면에 뜹니다.
          </p>
        </div>

        {candidates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
            아직 검토할 후보가 없습니다. 매일 KST 06:00에 자동으로 수집됩니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                className="rounded-2xl border border-cream-deep bg-white/70 p-5"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span className="w-fit rounded-full bg-cheese-100 px-2.5 py-1 text-xs font-bold text-cheese-600">
                    {CATEGORY_LABELS[candidate.category]}
                  </span>
                  <span className="text-xs text-ink-500">
                    {formatRelativeTime(candidate.publishedAt)} · {candidate.sourceName}
                  </span>
                  <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs font-semibold text-cheese-600 underline underline-offset-2"
                  >
                    원문 보기 →
                  </a>
                </div>

                <p className="mt-2 font-semibold text-ink-900">{candidate.title}</p>
                {candidate.excerpt && (
                  <p className="mt-1 text-sm text-ink-700">{candidate.excerpt}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setEditingId(editingId === candidate.id ? null : candidate.id)}
                    className="rounded-lg bg-cheese-400 px-3 py-1.5 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-300"
                  >
                    {editingId === candidate.id ? '접기' : '이 이슈로 카드 만들기'}
                  </button>
                  <button
                    onClick={() => handleDiscard(candidate.id)}
                    className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
                  >
                    건너뛰기
                  </button>
                </div>

                {editingId === candidate.id && (
                  <PublishForm
                    initial={{
                      title: candidate.title,
                      summary: candidate.excerpt,
                      whyImportant: '',
                      category: candidate.category,
                      keywords: candidate.keywords,
                    }}
                    submitLabel="발행"
                    busyLabel="발행 중…"
                    onCancel={() => setEditingId(null)}
                    onSubmit={(fields) => handlePublish(candidate, fields)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-ink-900">발행됨 (최근 {published.length}개)</h2>

        {published.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-10 text-center text-sm text-ink-500">
            아직 발행한 이슈가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-cream-deep overflow-hidden rounded-2xl border border-cream-deep bg-white/70">
            {published.map((issue) => (
              <li key={issue.id} className="px-5 py-3.5">
                <div className="flex items-center gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{issue.title}</p>
                    <p className="truncate text-xs text-ink-500">
                      {CATEGORY_LABELS[issue.category]} · {formatRelativeTime(issue.issuedAt)}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-2">
                    <button
                      onClick={() =>
                        setEditingPublishedId(editingPublishedId === issue.id ? null : issue.id)
                      }
                      className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
                    >
                      {editingPublishedId === issue.id ? '접기' : '수정하기'}
                    </button>
                    <button
                      onClick={() => handleUnpublish(issue.id)}
                      className="rounded-lg border border-cream-deep px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                    >
                      내리기
                    </button>
                  </div>
                </div>

                {editingPublishedId === issue.id && (
                  <PublishForm
                    initial={{
                      title: issue.title,
                      summary: issue.summary,
                      whyImportant: issue.whyImportant,
                      category: issue.category,
                      keywords: issue.keywords,
                    }}
                    sourceName={issue.sourceName}
                    sourceUrl={issue.sourceUrl}
                    submitLabel="수정 저장"
                    busyLabel="저장 중…"
                    onCancel={() => setEditingPublishedId(null)}
                    onSubmit={(fields) => handleUpdate(issue.id, fields)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

interface PublishFormValues {
  title: string
  summary: string
  whyImportant: string
  category: NewsCategory
  keywords: string[]
}

function PublishForm({
  initial,
  sourceName,
  sourceUrl,
  submitLabel,
  busyLabel,
  onCancel,
  onSubmit,
}: {
  initial: PublishFormValues
  sourceName?: string
  sourceUrl?: string
  submitLabel: string
  busyLabel: string
  onCancel: () => void
  onSubmit: (fields: PublishFormValues) => Promise<void>
}) {
  const [title, setTitle] = useState(initial.title)
  const [summary, setSummary] = useState(initial.summary)
  const [whyImportant, setWhyImportant] = useState(initial.whyImportant)
  const [category, setCategory] = useState<NewsCategory>(initial.category)
  const [keywordsInput, setKeywordsInput] = useState(initial.keywords.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim() || !summary.trim() || !whyImportant.trim()) {
      setError('제목·요약·왜 중요한가는 비워둘 수 없습니다.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        title: title.trim(),
        summary: summary.trim(),
        whyImportant: whyImportant.trim(),
        category,
        keywords: keywordsInput
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
      })
    } catch (caught) {
      console.error('뉴스 카드 저장 실패', caught)
      setError('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-4 rounded-xl border border-cheese-200 bg-cheese-50 p-4"
    >
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-xs font-semibold text-cheese-600 underline underline-offset-2"
        >
          원문 보기{sourceName ? ` (${sourceName})` : ''} →
        </a>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
        제목 (학생이 볼 문장으로 다듬기)
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
        핵심 요약 (2~3문장)
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
        왜 중요한가?
        <textarea
          value={whyImportant}
          onChange={(event) => setWhyImportant(event.target.value)}
          rows={3}
          placeholder="이 기술이 AI/IT/과학/공학 분야에서 왜 중요한지 학생 눈높이로"
          className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          카테고리
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as NewsCategory)}
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          >
            {CATEGORY_LIST.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-700">
          키워드 (쉼표로 구분)
          <input
            value={keywordsInput}
            onChange={(event) => setKeywordsInput(event.target.value)}
            placeholder="AI Agent, LLM"
            className="rounded-lg border border-cream-deep bg-white px-3 py-2 font-normal text-ink-900 focus:border-cheese-300 focus:outline-none"
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? busyLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-cream-deep px-5 py-2.5 font-semibold text-ink-700 transition-colors hover:border-cheese-300"
        >
          취소
        </button>
      </div>
    </form>
  )
}
