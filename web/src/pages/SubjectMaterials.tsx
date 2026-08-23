import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import LabPresentationOverlay from '../components/LabPresentationOverlay'
import LabPresenter from '../components/LabPresenter'
import PdfViewer from '../components/PdfViewer'
import PptxSlideViewer from '../components/PptxSlideViewer'
import { stopPresentation, subscribePresentation, type LabPresentationState } from '../lib/labPresentation'
import { getNotes, getSlidePdfFile, getSlidePptxFile, getSlideSet } from '../lib/labSlides'
import {
  type MaterialMeta,
  formatDate,
  formatSize,
  getMaterialFile,
  kindOf,
  listMaterials,
} from '../lib/materials'
import { usePinAttemptThrottle } from '../lib/pinThrottle'
import {
  getSubject,
  isSubjectUnlocked,
  unlockSubject,
  type OtPresentationMeta,
  type SubjectMeta,
} from '../lib/subjects'

/**
 * 과목별 수업자료 화면의 레이아웃 라우트 (/materials/:subjectId, LabGate.tsx와
 * 같은 <Outlet/> 패턴). 과목 로드 + ComingSoon/PinGate 통과는 여기서 한 번만
 * 하고, 통과하면 공용 헤더(뒤로가기·과목명·교사용 핀 배지·노션 링크) + 자료/
 * 수업목차 탭 nav 를 그린 뒤 자식 라우트를 <Outlet/>으로 내려보낸다 — 탭을
 * 바꿀 때마다 핀을 다시 묻지 않기 위해서다.
 *
 * 핀을 통과하기 전에는 자식 라우트 자체를 그리지 않는다 — Firestore 규칙상
 * 어차피 읽기가 공개라 완전한 차단은 아니지만, 최소한 이 화면 자체는 핀
 * 없이는 자료도 수업목차도 보여주지 않는다.
 *
 * 로그인한 교사는 핀을 몰라서가 아니라 매번 치는 게 번거로워서 건너뛴다 —
 * 자기 계정으로 이미 Google 로그인했다는 것 자체가 학생보다 강한 확인이다.
 */
export default function SubjectMaterials() {
  const { subjectId } = useParams<{ subjectId: string }>()
  const { state: authState } = useAuth()
  const isTeacherViewer = authState === 'teacher'
  const [subject, setSubject] = useState<SubjectMeta | null>(null)
  const [loadingSubject, setLoadingSubject] = useState(true)
  const [unlocked, setUnlocked] = useState(() => Boolean(subjectId && isSubjectUnlocked(subjectId)))

  useEffect(() => {
    if (!subjectId) return
    setLoadingSubject(true)
    getSubject(subjectId)
      .then(setSubject)
      .finally(() => setLoadingSubject(false))
  }, [subjectId])

  if (!subjectId) return null

  if (loadingSubject) {
    return <p className="text-ink-500">불러오는 중…</p>
  }

  if (!subject) {
    return (
      <div className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center">
        <p className="text-4xl">🤔</p>
        <p className="mt-3 font-bold text-ink-900">존재하지 않는 과목입니다.</p>
        <Link
          to="/materials"
          className="mt-2 inline-block text-sm font-semibold text-cheese-600 underline"
        >
          과목 목록으로 돌아가기
        </Link>
      </div>
    )
  }

  // 카드를 못 누르게 막아도 URL을 직접 치면 들어올 수 있으므로 여기서도 한 번
  // 더 막는다 — Materials.tsx 의 비활성 카드는 안내일 뿐, 실제로 막는 곳은
  // 여기다. 교사는 준비하는 동안에도 계속 들어와서 작업해야 하니 예외.
  if (!isTeacherViewer && subject.published === false) {
    return <ComingSoon subject={subject} />
  }

  const pinRequired = subject.pinRequired !== false

  if (!unlocked && !isTeacherViewer && pinRequired) {
    return <PinGate subject={subject} onUnlock={() => setUnlocked(true)} />
  }

  return <SubjectShell subject={subject} isTeacherViewer={isTeacherViewer} />
}

function ComingSoon({ subject }: { subject: SubjectMeta }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <span className="text-4xl">🚧</span>
      <h1 className="text-xl font-extrabold text-ink-900">{subject.name}</h1>
      <p className="text-sm text-ink-500">아직 준비중인 과목이에요. 조금만 기다려 주세요.</p>
      <Link to="/materials" className="mt-2 text-sm font-semibold text-cheese-600 underline">
        다른 과목 선택
      </Link>
    </div>
  )
}

function PinGate({ subject, onUnlock }: { subject: SubjectMeta; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  // 과목마다 독립적으로 세도록 subject.id 로 키를 나눈다 — pinThrottle.ts 설명 참고.
  const { isLocked, isBusy, remainingSeconds, recordFailure, reset } = usePinAttemptThrottle(
    `materials:${subject.id}`,
  )

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isLocked || isBusy) return
    if (pin.trim().length > 0 && pin.trim() === subject.pin) {
      reset()
      unlockSubject(subject.id)
      onUnlock()
    } else {
      recordFailure()
      setError('핀번호가 올바르지 않습니다.')
    }
  }

  const disabled = isLocked || isBusy

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <span className="text-4xl">🔒</span>
      <h1 className="text-xl font-extrabold text-ink-900">{subject.name}</h1>
      <p className="text-sm text-ink-500">선생님이 알려준 핀번호를 입력하세요.</p>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <input
          value={pin}
          onChange={(event) => {
            setPin(event.target.value)
            setError(null)
          }}
          inputMode="numeric"
          autoFocus
          disabled={disabled}
          placeholder="핀번호"
          className="rounded-lg border border-cream-deep bg-white px-3 py-2.5 text-center text-lg tracking-widest text-ink-900 focus:border-cheese-300 focus:outline-none disabled:opacity-50"
        />
        {isLocked ? (
          <p className="text-sm text-red-700">
            너무 많이 틀렸어요. {remainingSeconds}초 후 다시 시도해 주세요.
          </p>
        ) : (
          error && <p className="text-sm text-red-700">{error}</p>
        )}
        <button
          type="submit"
          disabled={disabled}
          className="rounded-xl bg-cheese-400 px-5 py-2.5 font-bold text-ink-900 transition-colors hover:bg-cheese-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          입장하기
        </button>
      </form>

      <Link to="/materials" className="text-sm font-semibold text-ink-500 underline">
        다른 과목 선택
      </Link>
    </div>
  )
}

export interface SubjectOutletContext {
  subject: SubjectMeta
  isTeacherViewer: boolean
}

/** 자식 라우트(MaterialsList/LabRoadmap/LabActivities/LabActivityDetail)가
 *  이미 핀을 통과한 subject 를 다시 불러오지 않고 그대로 받아 쓰는 훅. */
export function useSubjectContext(): SubjectOutletContext {
  return useOutletContext<SubjectOutletContext>()
}

function SubjectShell({
  subject,
  isTeacherViewer,
}: {
  subject: SubjectMeta
  isTeacherViewer: boolean
}) {
  const location = useLocation()
  const basePath = `/materials/${subject.id}`
  const otPath = `${basePath}/ot`
  const materialsPath = `${basePath}/materials`
  // 수업목차 탭이 index 라우트(basePath 자체 + content/:id 전부)이고, 자료
  // 탭만 별도 경로(materialsPath)다 — 학생이 과목에 들어오면 자료보다
  // 수업목차부터 보게 하려고 main.tsx 에서 순서를 이렇게 잡았다. OT 탭(otPath)은
  // 그보다 앞에 탭으로만 추가한 것이라 기본 진입 화면은 그대로 수업목차다.
  const isOtTab = location.pathname === otPath || location.pathname === `${otPath}/`
  const isMaterialsTab =
    location.pathname === materialsPath || location.pathname === `${materialsPath}/`

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <Link to="/materials" className="text-sm font-semibold text-ink-500 underline">
            ← 과목 목록
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{subject.name}</h1>
        </div>

        {isTeacherViewer && (
          // 교사만 보이는 표시 — 수업 중에 핀번호를 불러줄 때 교사 페이지까지
          // 안 가고 바로 여기서 읽을 수 있게. 학생에게는 절대 안 보인다
          // (isTeacherViewer 는 Firebase 로그인 상태로만 정해짐).
          <span className="rounded-lg border border-cheese-300 bg-cheese-50 px-3 py-1.5 text-sm font-semibold text-cheese-700">
            {subject.pinRequired === false
              ? '🔓 지금은 핀번호 없이 접속 가능'
              : `🔑 학생용 핀번호: ${subject.pin}`}
          </span>
        )}

        {subject.notionUrl && (
          <a
            href={subject.notionUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-cheese-300"
          >
            📔 노션 페이지 열기
          </a>
        )}
      </header>

      <nav className="flex gap-2 border-b border-cream-deep pb-3">
        {subject.otUrl && (
          <Link
            to={otPath}
            className={[
              'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
              isOtTab ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
            ].join(' ')}
          >
            🙋 OT
          </Link>
        )}
        <Link
          to={basePath}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            !isOtTab && !isMaterialsTab
              ? 'bg-cheese-400 text-ink-900'
              : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          🗺️ 수업목차
        </Link>
        <Link
          to={materialsPath}
          className={[
            'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
            isMaterialsTab ? 'bg-cheese-400 text-ink-900' : 'text-ink-700 hover:bg-cheese-100',
          ].join(' ')}
        >
          📎 자료
        </Link>
      </nav>

      <Outlet context={{ subject, isTeacherViewer } satisfies SubjectOutletContext} />
    </div>
  )
}

/**
 * subject.otUrl을 화면 안에 iframe으로 그대로 띄우는 공용 조각 — 학생용 OT 탭
 * (SubjectOt, 아래)과 교사 페이지(Teacher.tsx의 SubjectPanel)가 함께 쓴다.
 * 교사가 수업 중 이 화면을 프로젝터로 띄우고 진행하는 용도라, 학생 화면과
 * 똑같이 iframe으로 그대로 보여주는 게 목적이다(발표 슬라이드 자체를 실시간
 * 동기화하는 기능은 아니다 — 그건 Lab의 PDF/PPTX 발표 모드와 별개).
 */
export function OtFrame({ subject }: { subject: SubjectMeta }) {
  if (!subject.otUrl) {
    return (
      <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
        아직 OT 링크가 설정되지 않았습니다.
      </p>
    )
  }

  return (
    <iframe
      src={subject.otUrl}
      title={`${subject.name} OT`}
      className="h-[80vh] w-full rounded-2xl border border-cream-deep bg-white"
    />
  )
}

/** 학생용 OT 탭 — 새 탭으로 여는 노션 링크와 달리 "화면 안에 그대로 보여달라"는
 *  요청이라 iframe(OtFrame)을 그대로 쓴다. otUrl이 비어 있으면 nav에서 OT 탭
 *  자체가 안 보이지만, 링크를 직접 쳐서 들어오는 경우를 대비해 OtFrame이 안내
 *  문구를 대신 보여준다. 그 아래에 교사가 첨부한 OT 자료(OtMaterialsList)를
 *  이어서 보여준다 — 교사 로그인 상태로 이 화면에 들어오면 여기서 바로
 *  "발표 시작"까지 할 수 있다(아래 OtMaterialItem 주석 참고). */
export function SubjectOt() {
  const { subject, isTeacherViewer } = useSubjectContext()
  return (
    <div className="flex flex-col gap-6">
      <OtFrame subject={subject} />
      <OtMaterialsList subject={subject} isTeacherViewer={isTeacherViewer} />
    </div>
  )
}

const IDLE_PRESENTATION: LabPresentationState = { active: false, currentSlide: 1, updatedAt: 0 }

/**
 * 교사 페이지(OtPresentationPanel.tsx)에서 첨부한 "OT 자료"(PPT/PDF) 목록을
 * 학생 화면에 그대로 보여준다. 항목이 없으면(아직 아무것도 안 올렸으면)
 * 아무것도 안 그린다 — "그냥 첨부하면 보이도록"이 요청이었으므로 빈 상태
 * 안내문 없이 조용히 생략한다.
 */
function OtMaterialsList({
  subject,
  isTeacherViewer,
}: {
  subject: SubjectMeta
  isTeacherViewer: boolean
}) {
  const items = subject.otPresentations ?? []
  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {items.map((entry) => (
        <OtMaterialItem key={entry.id} entry={entry} isTeacherViewer={isTeacherViewer} />
      ))}
    </div>
  )
}

/**
 * OT 자료 하나 — 기본은 슬라이드 열람(PptxSlideViewer, 원본 다운로드 불가)
 * 뿐이고, 교사 로그인 상태(isTeacherViewer)일 때만 "발표 시작" 버튼과 발표
 * 모드(LabPresenter, 슬라이드+대본 나란히)가 나타난다 — Lab 활동 학생 화면
 * (LabActivityDetail.tsx)과 정확히 같은 구조를 재사용한다. 이렇게 하면 첨부
 * 화면(교사 페이지)과 발표 화면이 분리되지 않고, 교사가 지금 학생이 보는 것과
 * 똑같은 화면에서 발표를 시작하게 된다.
 *
 * 대본(교사용 발표 노트)은 isTeacherViewer일 때만 불러온다 — 학생 브라우저로는
 * getNotes 호출 자체가 안 나간다. 다른 기기(학생 화면이든, 교사의 다른 기기든)
 * 에서 발표가 시작되면 LabPresentationOverlay로 같은 슬라이드를 그대로
 * 따라간다.
 */
function OtMaterialItem({
  entry,
  isTeacherViewer,
}: {
  entry: OtPresentationMeta
  isTeacherViewer: boolean
}) {
  const slideId = entry.id
  const [slideFiles, setSlideFiles] = useState<{ pptx: Blob | null; pdf: Blob | null } | null>(
    null,
  )
  const [notes, setNotes] = useState<string[]>([])
  const [presentation, setPresentation] = useState<LabPresentationState>(IDLE_PRESENTATION)
  /** 이 탭에서 발표 화면(LabPresenter 모달)을 열어두고 있는지 —
   *  LabActivityDetail과 같은 이유로 Firestore의 active와는 별개다. */
  const [isPresenting, setIsPresenting] = useState(false)
  /** 발표 화면을 열면 몇 페이지부터 훑어볼지 — LabActivityDetail과 같은
   *  이유로, presentation이 처음 로드되면 "마지막으로 발표를 종료한 자리"로
   *  한 번 맞추고, 그 뒤로는 교사가 직접 넘기는 대로 따라간다. */
  const [browsePage, setBrowsePage] = useState(1)
  const [presentationLoaded, setPresentationLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSlideSet(slideId).then(async (meta) => {
      if (!meta.pptx && !meta.pdf) {
        if (!cancelled) setSlideFiles(null)
        return
      }
      const [pptx, pdf] = await Promise.all([
        meta.pptx ? getSlidePptxFile(slideId) : Promise.resolve(null),
        meta.pdf ? getSlidePdfFile(slideId) : Promise.resolve(null),
      ])
      if (!cancelled) setSlideFiles({ pptx, pdf })
    })
    if (isTeacherViewer) {
      getNotes(slideId).then((loaded) => {
        if (!cancelled) setNotes(loaded)
      })
    }
    return () => {
      cancelled = true
    }
  }, [slideId, isTeacherViewer])

  useEffect(() => {
    setPresentationLoaded(false)
    return subscribePresentation(slideId, (state) => {
      setPresentation(state)
      setPresentationLoaded(true)
    })
  }, [slideId])

  // presentation이 막 로드된 순간에 딱 한 번, 훑어보기 시작 페이지를
  // "마지막으로 발표를 종료한 자리"로 맞춘다(LabActivityDetail과 같은 이유로
  // presentation.currentSlide는 의존성에 넣지 않는다).
  useEffect(() => {
    if (presentationLoaded) setBrowsePage(presentation.currentSlide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentationLoaded])

  // 아직 PPT/PDF를 안 올린 항목(제목만 추가해둔 상태)은 조용히 생략한다 —
  // 교사가 실제로 파일을 첨부해야만 학생 화면에 나타난다.
  if (!slideFiles || (!slideFiles.pptx && !slideFiles.pdf)) return null
  // presentation 구독이 처음 응답하기 전엔 currentSlide가 진짜 "마지막
  // 종료 지점"인지 IDLE 기본값인지 구분할 수 없다 — 그 상태로 훑어보기
  // 화면을 그리면 나중에 진짜 값이 와도 1쪽에 멈춰있는 것처럼 보일 수
  // 있어서, 응답이 올 때까지는 아예 그리지 않는다.
  if (!presentationLoaded) return null

  const canPresent = isTeacherViewer && !!slideFiles.pdf
  const showFollowerOverlay = presentation.active && !isPresenting && !!slideFiles.pdf

  /** "발표 화면 열기" — 방송을 시작하는 게 아니라 모달만 연다
   *  (LabPresenter.tsx 주석, LabActivityDetail과 같은 이유). */
  function handleOpenPresenter() {
    setIsPresenting(true)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-cream-deep bg-white/70 p-6">
      {showFollowerOverlay && slideFiles.pdf && (
        <LabPresentationOverlay
          pdfFile={slideFiles.pdf}
          currentSlide={presentation.currentSlide}
          filename={entry.title}
          ink={presentation.ink}
          isTeacherViewer={isTeacherViewer}
          onTakeControl={() => setIsPresenting(true)}
        />
      )}

      {isPresenting && slideFiles.pdf && (
        <LabPresenter
          activityId={slideId}
          pdfFile={slideFiles.pdf}
          filename={entry.title}
          presentation={presentation}
          initialBrowsePage={browsePage}
          notes={notes}
          onBrowsePageChange={setBrowsePage}
          onNoteSaved={(slideIndex, text) =>
            setNotes((current) => {
              const next = [...current]
              while (next.length < slideIndex) next.push('')
              next[slideIndex - 1] = text
              return next
            })
          }
          onClose={() => setIsPresenting(false)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-ink-900">{entry.title}</h2>
        {canPresent && (
          <div className="flex items-center gap-2">
            {presentation.active && (
              <>
                <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  진행 중 · {presentation.currentSlide}쪽
                </span>
                <button
                  onClick={() => {
                    // 모달을 열지 않은 채로 여기서 바로 끝내는 경우 —
                    // LabPresenter.tsx의 같은 로직을 못 타므로 여기서 직접
                    // 훑어보기 위치를 방금까지의 자리로 맞춘다.
                    setBrowsePage(presentation.currentSlide)
                    void stopPresentation(slideId)
                  }}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  발표 끝내기
                </button>
              </>
            )}
            <button
              onClick={handleOpenPresenter}
              className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 transition-colors hover:bg-cheese-300"
            >
              {presentation.active ? '▶ 발표 화면 다시 열기' : '▶ 발표 화면 열기'}
            </button>
          </div>
        )}
      </div>
      <PptxSlideViewer
        pptxFile={slideFiles.pptx}
        pdfFile={slideFiles.pdf}
        filename={entry.title}
        initialPage={browsePage}
        onPageChange={setBrowsePage}
      />
    </div>
  )
}

export function MaterialsList() {
  const { subject } = useSubjectContext()
  const [materials, setMaterials] = useState<MaterialMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MaterialMeta | null>(null)

  useEffect(() => {
    listMaterials(subject.id)
      .then(setMaterials)
      .finally(() => setLoading(false))
  }, [subject.id])

  return (
    <div className="flex flex-col gap-6">
      {loading ? (
        <p className="text-ink-500">불러오는 중…</p>
      ) : materials.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cream-deep px-6 py-14 text-center text-sm text-ink-500">
          아직 올라온 자료가 없습니다.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((material) => (
            <li key={material.id}>
              <button
                onClick={() => setSelected(material)}
                className="flex h-full w-full flex-col gap-2 rounded-2xl border border-cream-deep bg-white/70 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-cheese-300 hover:shadow-md"
              >
                <span className="text-2xl">{iconFor(material)}</span>
                <h2 className="font-bold text-ink-900">{material.title}</h2>
                {material.description && (
                  <p className="line-clamp-2 text-sm text-ink-700">{material.description}</p>
                )}
                <p className="mt-auto pt-2 text-xs text-ink-500">
                  {formatDate(material.createdAt)} · {formatSize(material.size)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <Viewer material={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function iconFor(material: MaterialMeta): string {
  switch (kindOf(material)) {
    case 'pdf':
      return '📄'
    case 'image':
      return '🖼️'
    case 'text':
      return '📝'
    case 'archive':
      return '🗂️'
    default:
      return '📎'
  }
}

function Viewer({ material, onClose }: { material: MaterialMeta; onClose: () => void }) {
  const [file, setFile] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const kind = kindOf(material)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    getMaterialFile(material.id)
      .then(async (blob) => {
        if (!blob || cancelled) {
          if (!blob && !cancelled) setLoadError('자료를 찾을 수 없습니다.')
          return
        }
        if (kind === 'text') setText(await blob.text())
        objectUrl = URL.createObjectURL(blob)
        setFile(blob)
        setUrl(objectUrl)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('자료 불러오기 실패', caught)
        setLoadError('자료를 불러오지 못했습니다. 잠시 후 다시 열어주세요.')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [material.id, kind])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-cream-deep px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate font-bold text-ink-900">{material.title}</h2>
            <p className="truncate text-xs text-ink-500">
              {material.filename} · {formatSize(material.size)}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {url && (
              <a
                href={url}
                download={material.filename}
                className="rounded-lg bg-cheese-400 px-4 py-2 text-sm font-bold text-ink-900 hover:bg-cheese-300"
              >
                다운로드
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-cream-deep px-3 py-2 text-sm font-semibold text-ink-700 hover:border-cheese-300"
            >
              닫기
            </button>
          </div>
        </header>

        <div
          className={`flex-1 bg-cream/40 ${kind === 'pdf' ? 'overflow-hidden' : 'overflow-auto'}`}
        >
          {loadError ? (
            <p className="p-8 text-center text-ink-500">{loadError}</p>
          ) : !url || !file ? (
            <p className="p-8 text-center text-ink-500">불러오는 중…</p>
          ) : kind === 'pdf' ? (
            <PdfViewer file={file} filename={material.filename} />
          ) : kind === 'image' ? (
            <img src={url} alt={material.title} className="mx-auto max-h-full object-contain" />
          ) : kind === 'text' ? (
            <pre className="p-5 font-mono text-sm whitespace-pre-wrap text-ink-900">{text}</pre>
          ) : (
            <p className="p-8 text-center text-ink-500">
              이 형식은 미리보기를 지원하지 않습니다. 다운로드해서 열어주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
