import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { listSubjects, type SubjectMeta } from '../lib/subjects'

/**
 * 수업자료 첫 화면: 과목을 고르는 곳.
 *
 * 실제 자료 목록·핀 입력은 /materials/:subjectId (SubjectMaterials) 가 맡는다 —
 * 로그인한 교사는 그 화면에서 핀 없이 바로 들어간다. 여기 카드에 자물쇠 문구를
 * 그대로 두면 실제로는 안 막는데 막는 것처럼 보이니, 교사 로그인 상태면
 * 문구도 같이 바꾼다.
 */
export default function Materials() {
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [subjects, setSubjects] = useState<SubjectMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch((caught) => {
        console.error('과목 목록 불러오기 실패', caught)
        setLoadError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">수업자료</h1>
        <p className="text-sm text-ink-500">
          {isTeacherViewer
            ? '교사로 로그인되어 있어 핀번호 없이 바로 볼 수 있습니다.'
            : '과목을 고르고 선생님이 알려준 핀번호를 입력하면 자료를 볼 수 있습니다.'}
        </p>
      </header>

      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : loadError ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          과목 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : subjects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 준비된 과목이 없습니다.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => {
            // 준비중(비공개) 과목은 교사가 아닌 학생에게는 이름만 보이고 들어갈
            // 수 없다 — 카드 자체를 Link 대신 비활성 div 로 그린다. Firestore
            // 규칙상 자료 자체는 어차피 공개라 "숨기기"는 아니고, 클릭해도
            // 소용없다는 걸 미리 알려주는 정도의 안내다(SubjectMaterials.tsx
            // 에서 직접 URL로 들어와도 한 번 더 막는다).
            const isComingSoon = !isTeacherViewer && subject.published === false
            const icon = isTeacherViewer
              ? '📂'
              : isComingSoon
                ? '🚧'
                : subject.pinRequired === false
                  ? '🔓'
                  : '🔒'
            const description = isTeacherViewer
              ? '바로 열람 가능'
              : isComingSoon
                ? '아직 준비중이에요. 조금만 기다려 주세요.'
                : subject.pinRequired === false
                  ? '핀번호 없이 바로 열람 가능'
                  : '핀번호를 입력하면 열립니다'

            if (isComingSoon) {
              return (
                <li key={subject.id}>
                  <div className="flex h-full cursor-not-allowed flex-col gap-2 rounded-2xl border border-dashed border-cream-deep bg-white/40 p-6 opacity-70">
                    <span className="text-3xl">{icon}</span>
                    <h2 className="text-lg font-bold text-ink-900">{subject.name}</h2>
                    <p className="text-sm text-ink-500">{description}</p>
                  </div>
                </li>
              )
            }

            return (
              <li key={subject.id}>
                <Link
                  to={`/materials/${subject.id}`}
                  className="flex h-full flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-6 transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md"
                >
                  <span className="text-3xl">{icon}</span>
                  <h2 className="text-lg font-bold text-ink-900">{subject.name}</h2>
                  <p className="text-sm text-ink-500">{description}</p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
