import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import '@fontsource/jua'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import Home from './pages/Home'
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
import ComingSoon from './pages/ComingSoon'
import NotFound from './pages/NotFound'

// Monaco 에디터는 무겁다(2MB 남짓). 홈과 수업자료 화면까지 느려지지 않도록
// Python 실습에 들어갈 때만 내려받는다.
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
            <Route
              path="practice/pico"
              element={
                <ComingSoon
                  emoji="🔌"
                  title="Pico 2 W 시뮬레이터"
                  backTo={{ to: '/practice', label: '실습' }}
                  description={
                    <>
                      브라우저에서 가상 Pico 2 W 보드로
                      <br />
                      GPIO, LED, 버튼을 직접 다뤄보세요.
                    </>
                  }
                  secondary={{ to: '/practice/python', label: 'Python 실습 하러 가기' }}
                />
              }
            />
            {/* 예전 주소로 온 링크·북마크가 끊기지 않도록 새 위치로 보낸다. */}
            <Route path="python" element={<Navigate to="/practice/python" replace />} />
            <Route
              path="projects"
              element={
                <ComingSoon
                  emoji="🚀"
                  title="프로젝트"
                  description="배운 내용을 활용해 나만의 작품과 프로젝트를 만들어보는 공간입니다. 곧 열립니다!"
                />
              }
            />
            {/* 핀을 통과해야 아래 활동 화면들이 그려진다 — LabGate 가 <Outlet/> 을 연다. */}
            <Route path="lab" element={<LabGate />}>
              <Route index element={<LabHome />} />
              <Route path="roadmap" element={<LabRoadmap />} />
              <Route path="activities" element={<LabActivities />} />
              <Route path="activities/:id" element={<LabActivityDetail />} />
            </Route>
            <Route path="teacher" element={<Teacher />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
