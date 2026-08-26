import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import '@fontsource/jua'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { installMapUpsertPolyfill } from './lib/mapUpsertPolyfill'

// pdf.js(PdfViewer.tsx)가 나중에 동적으로 로드되기 전에 먼저 채워둬야 한다.
installMapUpsertPolyfill()
import Home from './pages/Home'
import Exercises from './pages/Exercises'
import News from './pages/News'
import Materials from './pages/Materials'
import SubjectMaterials, { MaterialsList, SubjectOt } from './pages/SubjectMaterials'
import Practice from './pages/Practice'
import LabGate from './pages/LabGate'
import LabHome from './pages/LabHome'
import LabRoadmap from './pages/LabRoadmap'
import LabActivities from './pages/LabActivities'
import LabActivityDetail from './pages/LabActivityDetail'
import Teacher from './pages/Teacher'
import Timetable from './pages/Timetable'
import PicoGate from './pages/PicoGate'
import NotFound from './pages/NotFound'

// Monaco 에디터는 무겁다(2MB 남짓). 홈과 수업자료 화면까지 느려지지 않도록
// Python 실습에 들어갈 때만 내려받는다. Pico 는 PicoGate.tsx 가 자체적으로
// lazy import 한다(교사/공개 여부를 먼저 가린 뒤에만 받아오도록).
// 문제 푸는 화면은 Monaco 에디터(2MB 남짓)를 쓴다 — PythonLab/CLab/PicoLab 과 같은
// 이유로 들어갈 때만 내려받는다. 정적으로 두면 홈 화면을 여는 모든 학생이 에디터를
// 함께 받게 된다(실제로 그렇게 만들어 index 청크가 1.1MB → 3.8MB 로 뛰었다).
// 목록 화면(Exercises)은 에디터를 안 쓰므로 정적이어도 된다.
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'))
const PythonLab = lazy(() => import('./pages/PythonLab'))
const CLab = lazy(() => import('./pages/CLab'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {/* GitHub Pages 는 앱이 /chicode/ 아래에 놓인다. 빌드의 base 경로를 그대로 따른다. */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Home />} />
            <Route path="news" element={<News />} />
            <Route path="materials" element={<Materials />} />
            {/* 과목별 핀 게이트가 <Outlet/> 을 연다(lab의 LabGate 와 같은 패턴) —
                자료/수업목차 탭을 오가도 핀을 다시 묻지 않는다. LabRoadmap/
                LabActivities/LabActivityDetail 을 여기 두 번째로 마운트해서
                과목별 "수업목차"/"내용" 화면으로 재사용한다(useLabScope 참고,
                페이지를 복제하지 않았다). 학생이 과목에 들어오면 자료보다
                수업목차부터 보게 하고 싶어서 수업목차(LabRoadmap)를 index로,
                자료 목록은 /materials 하위 경로로 옮겼다. */}
            <Route path="materials/:subjectId" element={<SubjectMaterials />}>
              <Route index element={<LabRoadmap />} />
              <Route path="ot" element={<SubjectOt />} />
              <Route path="materials" element={<MaterialsList />} />
              <Route path="content" element={<LabActivities />} />
              <Route path="content/:id" element={<LabActivityDetail />} />
            </Route>
            <Route path="practice" element={<Practice />} />
            <Route
              path="practice/python"
              element={
                <Suspense fallback={<p className="text-ink-500">Python 실습 화면을 여는 중…</p>}>
                  <PythonLab />
                </Suspense>
              }
            />
            <Route
              path="practice/c"
              element={
                <Suspense fallback={<p className="text-ink-500">C언어 실습 화면을 여는 중…</p>}>
                  <CLab />
                </Suspense>
              }
            />
            {/* 교사는 항상 들어간다. 학생은 practiceSettings/pico2w 가 열려있어야
                한다 — 아직 준비 중일 땐 ComingSoon(PicoGate.tsx 참고). */}
            <Route path="practice/pico" element={<PicoGate />} />
            {/* 예전 주소로 온 링크·북마크가 끊기지 않도록 새 위치로 보낸다. */}
            <Route path="python" element={<Navigate to="/practice/python" replace />} />
            <Route path="exercises" element={<Exercises />} />
            <Route
              path="exercises/:id"
              element={
                <Suspense fallback={<p className="text-ink-500">문제를 여는 중…</p>}>
                  <ExerciseDetail />
                </Suspense>
              }
            />
            {/* "프로젝트" 자리에 연습문제를 넣었다 — 그 탭은 만들다 만 자리표시자였고,
                수업자료(읽기)와 실습(자유 작성) 사이의 "연습하고 확인하기"가 비어
                있었다. 예전 주소로 온 링크는 끊지 않고 새 위치로 보낸다(python →
                practice/python 과 같은 처리). */}
            <Route path="projects" element={<Navigate to="/exercises" replace />} />
            {/* 핀을 통과해야 아래 활동 화면들이 그려진다 — LabGate 가 <Outlet/> 을 연다. */}
            <Route path="lab" element={<LabGate />}>
              <Route index element={<LabHome />} />
              <Route path="roadmap" element={<LabRoadmap />} />
              <Route path="activities" element={<LabActivities />} />
              <Route path="activities/:id" element={<LabActivityDetail />} />
            </Route>
            <Route path="teacher" element={<Teacher />} />
            <Route path="timetable" element={<Timetable />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
