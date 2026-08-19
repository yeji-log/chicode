import { useParams } from 'react-router-dom'

/**
 * LabRoadmap.tsx/LabActivities.tsx/LabActivityDetail.tsx 세 화면은 두 곳에
 * 마운트된다 — Lab 전역(/lab/roadmap 등)과 과목별 수업자료(/materials/:subjectId/
 * outline 등). 두 맥락은 데이터 스코프(subjectId 유무)와 화면 문구(로드맵/시즌/
 * 활동 ↔ 수업목차/내용)와 링크 대상만 다르고 나머지 로직은 완전히 같아서,
 * 페이지를 복제하는 대신 이 훅으로 스코프를 하나로 계산해 세 페이지가 각자
 * 분기하게 한다.
 *
 * react-router 는 상위 라우트의 param 을 자식에서도 useParams() 로 그대로
 * 받으므로, 이 세 컴포넌트를 main.tsx 에서 `materials/:subjectId/outline` 같은
 * 경로 아래 두 번째로 마운트하기만 하면 subjectId 가 자동으로 잡힌다 — Lab
 * 쪽 경로(/lab/roadmap 등)엔 subjectId 파라미터 자체가 없으므로 항상 undefined.
 */
export interface LabScope {
  /** 있으면 이 과목(subjects/{id})의 수업목차/내용 스코프. 없으면 Lab 전역. */
  subjectId?: string
  /** '시즌' | '수업목차' */
  seasonNoun: string
  /** '활동' | '내용' */
  activityNoun: string
  /** 수업목차(시즌) 카드 그리드 경로. */
  roadmapPath: string
  /** 내용(활동) 목록 경로. */
  activitiesPath: string
  /** 내용(활동) 상세 경로. */
  activityDetailPath: (id: string) => string
}

export function useLabScope(): LabScope {
  const { subjectId } = useParams<{ subjectId?: string }>()

  if (subjectId) {
    return {
      subjectId,
      seasonNoun: '수업목차',
      activityNoun: '내용',
      roadmapPath: `/materials/${subjectId}/outline`,
      activitiesPath: `/materials/${subjectId}/content`,
      activityDetailPath: (id) => `/materials/${subjectId}/content/${id}`,
    }
  }

  return {
    subjectId: undefined,
    seasonNoun: '시즌',
    activityNoun: '활동',
    roadmapPath: '/lab/roadmap',
    activitiesPath: '/lab/activities',
    activityDetailPath: (id) => `/lab/activities/${id}`,
  }
}
