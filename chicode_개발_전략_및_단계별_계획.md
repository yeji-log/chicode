# chicode 웹사이트 구현 전략 및 단계별 개발 계획

## 1. 프로젝트 개요

**chicode**는 교사와 학생이 웹 브라우저에서 수업자료를 확인하고 Python 및 Raspberry Pi Pico 2 W를 실습할 수 있는 교육 플랫폼이다.

핵심 기능은 다음 3가지다.

1. **수업자료**
   - 교사만 파일 업로드/삭제 가능
   - 학생은 파일 열람 및 다운로드 가능
   - PDF 등 주요 파일의 웹 뷰어 지원

2. **Python 실습 환경**
   - 웹 브라우저에서 Python 코드 작성
   - 실행 결과 확인
   - 코드 저장 및 불러오기
   - 향후 과제/자동채점으로 확장

3. **Raspberry Pi Pico 2 W 시뮬레이터**
   - 브라우저에서 Pico 2 W 가상 보드 사용
   - GPIO, LED, Button 등의 가상 하드웨어
   - MicroPython 코드 실행
   - 회로 구성 및 시뮬레이션
   - 향후 센서, 디스플레이, 모터 등으로 확장

---

# 2. 사용자 및 인증 정책

chicode는 **일반 회원가입 시스템을 사용하지 않는다.**

학생과 교사의 접근 방식을 분리한다.

## 학생

- 회원가입 없음
- 로그인 없음
- 학생 페이지에서 실습 기능 이용
- 수업자료 열람 및 다운로드
- Python 실습
- Pico 2 W 시뮬레이터 이용

## 교사

- 교사 페이지 별도 제공
- Firebase Authentication을 이용한 Google 로그인
- 사전에 허용된 Google 계정만 교사 페이지 접근 가능
- 교사만 수업자료 업로드/삭제 가능
- 향후 과제 및 학생 결과 관리 가능

### 접근 구조

```text
chicode
│
├── 학생 페이지
│   ├── 수업자료
│   ├── Python 실습
│   └── Pico 2 W 실습
│
└── 교사 페이지
    ├── Google 로그인
    ├── 수업자료 관리
    ├── 과제 관리
    └── 학생 결과 확인
```

---

# 3. 교사 인증 구조

Firebase Authentication의 Google 로그인 기능을 사용한다.

```text
교사
 ↓
/teacher/login
 ↓
Google 로그인
 ↓
Firebase Authentication
 ↓
허용된 교사 계정인지 확인
 ├── YES → /teacher
 └── NO  → 접근 거부
```

## 허용 교사 계정 관리

초기에는 허용된 교사 이메일 목록을 별도로 관리한다.

예:

```text
teachers
├── teacher1@gmail.com
├── teacher2@school.ac.kr
└── teacher3@gmail.com
```

단순히 Google 로그인에 성공했다고 교사 권한을 주어서는 안 된다.

**반드시 허용 목록 또는 교사 권한을 추가로 확인해야 한다.**

---

# 4. 권한 보안 원칙

프론트엔드에서 버튼을 숨기는 것만으로 권한을 구현하지 않는다.

예를 들어 학생에게 업로드 버튼을 보여주지 않는 것만으로는 충분하지 않다.

```text
학생
 ↓
업로드 API 요청
 ↓
Backend에서 교사 권한 확인
 ↓
권한 없음
 ↓
403 Forbidden
```

교사도 다음과 같이 처리한다.

```text
Google 로그인
 ↓
Firebase ID Token
 ↓
Backend에서 Token 검증
 ↓
교사 권한 확인
 ↓
파일 업로드 허용
```

향후에는 Firebase Custom Claims를 이용해 다음과 같이 확장할 수 있다.

```text
Firebase User
├── uid
├── email
└── role: teacher
```

---

# 5. 권장 기술 스택

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Monaco Editor

Monaco Editor는 VS Code 계열의 코드 편집 환경을 제공하므로 Python 및 MicroPython 편집기에 적합하다.

## Backend

- Python
- FastAPI

## Database

- PostgreSQL

## Authentication

- Firebase Authentication
- Google Sign-In

## File Storage

초기에는 Firebase Storage 또는 별도의 객체 스토리지를 사용할 수 있다.

## Python 실행

- 별도 Sandbox/Container 환경

## Pico 시뮬레이션

- 별도의 Simulator Core
- MicroPython 실행 환경
- Circuit Engine
- Web Renderer

---

# 6. 전체 시스템 구조

```text
                         chicode
                            │
              ┌─────────────┴─────────────┐
              │                           │
           Frontend                    Backend
              │                           │
      ┌───────┼────────┐          ┌───────┼────────┐
      │       │        │          │       │        │
   수업자료  Python   Pico       인증    파일     실행
      │       │        │          │       │        │
      └───────┴────────┘          └───────┴────────┘
                                          │
                              ┌───────────┼───────────┐
                              │           │           │
                           Database    Storage    Sandbox
```

---

# 7. 화면 구조

## 학생

```text
/student
│
├── /materials
├── /python
└── /pico
```

## 교사

```text
/teacher/login
        ↓
/teacher
│
├── /materials
├── /assignments
├── /students
└── /results
```

학생과 교사의 UI를 완전히 분리하여 각각 필요한 기능만 보여준다.

---

# 8. 데이터베이스 설계

회원가입이 없으므로 학생 계정 테이블은 MVP에서 필수가 아니다.

초기에는 다음과 같은 구조를 권장한다.

```text
teachers
├── id
├── email
├── firebase_uid
└── created_at

classes
├── id
├── name
├── teacher_id
└── created_at

materials
├── id
├── class_id
├── title
├── filename
├── storage_path
├── uploaded_by
└── created_at

python_projects
├── id
├── title
├── code
├── owner_key
└── updated_at

pico_projects
├── id
├── title
├── code
├── circuit_data
├── owner_key
└── updated_at
```

학생별 저장 기능이 필요해지면 학생 식별 방식과 함께 별도 구조를 추가한다.

---

# 9. 1단계 — 프로젝트 기본 구조

## 목표

chicode가 실제로 실행되는 기본 웹사이트를 만든다.

### 구현

- Git 저장소 생성
- React + TypeScript 프로젝트 생성
- FastAPI Backend 생성
- 기본 API 연결
- PostgreSQL 연결
- 기본 레이아웃
- 학생 페이지
- 교사 로그인 페이지
- 교사 페이지

### 완료 기준

```text
chicode 실행
 ↓
학생 페이지 접근 가능
 ↓
교사 페이지 접근
 ↓
Google 로그인
 ↓
허용 교사만 진입 가능
```

---

# 10. 2단계 — Firebase Google 인증

## 구현

1. Firebase 프로젝트 생성
2. Firebase Authentication 활성화
3. Google 로그인 Provider 활성화
4. 허용 교사 계정 등록
5. Google 로그인 구현
6. 로그인 후 교사 계정 확인
7. 비허용 계정 접근 차단
8. Backend에서 Firebase ID Token 검증

### 중요

허용 계정 확인을 브라우저에서만 수행하지 않는다.

```text
Frontend
  ↓
Firebase Auth

Backend
  ↓
Firebase Admin SDK
  ↓
ID Token 검증
  ↓
교사 권한 확인
```

---

# 11. 3단계 — 수업 및 수업자료

## 교사

- 수업 생성
- 수업자료 업로드
- 자료 삭제
- 자료 목록 관리

## 학생

- 수업자료 목록 확인
- PDF/이미지 등 자료 열람
- 파일 다운로드

### 파일 처리 구조

```text
교사
 ↓
파일 업로드
 ↓
Backend 권한 검사
 ↓
Storage 저장
 ↓
Database에 파일 정보 저장
```

실제 파일과 파일의 메타데이터를 분리한다.

---

# 12. 4단계 — 자료 뷰어

초기 지원:

- PDF
- PNG
- JPG
- TXT
- ZIP

PDF는 웹 기반 Viewer를 사용한다.

이미지는 웹에서 바로 표시한다.

기타 파일은 다운로드를 기본으로 제공하고 필요에 따라 미리보기 기능을 추가한다.

---

# 13. 5단계 — Python 실습 환경

## 기본 UI

```text
┌──────────────────────────────────────┐
│ Python 실습                           │
├──────────────────────┬───────────────┤
│                      │               │
│   Python Editor      │   실행 결과   │
│                      │               │
│   print("Hello")     │   Hello       │
│                      │               │
├──────────────────────┴───────────────┤
│              [ 실행 ]                 │
└──────────────────────────────────────┘
```

### 기능

- Monaco Editor
- Python 문법 하이라이트
- 실행
- 표준 출력 표시
- 오류 표시
- 코드 저장
- 코드 불러오기

---

# 14. 6단계 — Python Sandbox

Python 코드를 Backend 서버에서 직접 실행하지 않는다.

```text
Browser
 ↓
Backend API
 ↓
Execution Queue
 ↓
Sandbox Container
 ↓
Python 실행
 ↓
실행 결과
 ↓
Browser
```

## 제한

- 실행 시간
- CPU
- 메모리
- 네트워크
- 파일 시스템
- 프로세스 생성
- 시스템 명령 실행

Python 실행 환경은 웹 애플리케이션 서버와 반드시 분리한다.

---

# 15. 7단계 — Pico 2 W 시뮬레이터 MVP

Pico 시뮬레이터는 프로젝트에서 가장 난도가 높은 기능이다.

처음부터 Tinkercad 수준을 목표로 하지 않는다.

### 1차 목표

```text
Pico 2 W
 ↓
GPIO
 ↓
LED
 ↓
Button
 ↓
MicroPython
```

예:

```python
from machine import Pin

led = Pin(0, Pin.OUT)
led.value(1)
```

실행하면 시뮬레이터에서 연결된 LED가 켜져야 한다.

---

# 16. 8단계 — Pico 시뮬레이터 구조

시뮬레이터를 3개의 핵심 영역으로 분리한다.

```text
Pico Simulator
│
├── Code Runtime
│
├── Circuit Engine
│
└── Renderer
```

## Code Runtime

MicroPython 코드를 실행한다.

## Circuit Engine

가상 GPIO와 부품의 상태를 관리한다.

예:

```text
GPIO0 = HIGH
GPIO1 = LOW
GPIO2 = INPUT
```

## Renderer

브라우저 화면에 다음을 표시한다.

- Pico 2 W
- GPIO 핀
- LED
- Button
- 전선
- 부품 상태

---

# 17. 9단계 — Pico 회로 편집기

드래그 앤 드롭 방식으로 회로를 구성한다.

```text
┌─────────────┬────────────────────────┐
│ Components  │                        │
│             │       Pico 2 W         │
│ LED         │                        │
│ Button      │       ┌───────┐        │
│ Resistor    │       │ Pico  │        │
│             │       └───────┘        │
│             │          │             │
│             │         LED            │
└─────────────┴────────────────────────┘
```

회로 구성은 JSON 형태로 저장한다.

```text
{
  "components": [...],
  "connections": [...]
}
```

---

# 18. 10단계 — Pico 부품 확장

## 1차

- LED
- RGB LED
- Button
- Resistor
- Buzzer

## 2차

- Potentiometer
- Photoresistor
- Temperature Sensor
- Servo

## 3차

- OLED
- LCD
- Ultrasonic Sensor
- I²C 센서
- SPI 센서

---

# 19. 11단계 — MicroPython API 확장

우선 다음 API를 지원한다.

```python
machine.Pin
machine.PWM
machine.ADC
machine.I2C
machine.SPI
time
```

이후 실제 Pico 2 W에서 사용하는 주요 API를 단계적으로 추가한다.

---

# 20. 12단계 — 교육용 과제

교사가 Pico 또는 Python 과제를 만들 수 있도록 한다.

예:

```text
과제: LED 깜빡이기

조건:
- GPIO 0 사용
- LED 연결
- 1초 간격으로 ON/OFF
```

학생은 브라우저에서 코드를 작성하고 실행한다.

---

# 21. 13단계 — 자동 채점

코드 문자열을 단순 비교하지 않고 실행 결과와 시뮬레이션 상태를 이용한다.

예:

```text
GPIO0이 출력 모드인가?
        ↓
LED가 올바르게 연결되어 있는가?
        ↓
LED 상태가 요구사항대로 변하는가?
        ↓
정답
```

---

# 22. 14단계 — 교사 관리 기능

교사 대시보드:

```text
교사 대시보드
│
├── 내 수업
├── 수업자료
├── Python 과제
├── Pico 과제
├── 학생 결과
└── 설정
```

향후 다음 정보를 확인한다.

- 과제 제출 여부
- 코드
- 실행 결과
- Pico 회로
- 점수
- 피드백

---

# 23. 15단계 — 보안

## Firebase

- Google OAuth 사용
- 허용 교사 계정 관리
- Firebase ID Token 검증
- Backend에서 교사 권한 확인

## 파일

- 확장자 검사
- MIME 타입 검사
- 파일 크기 제한
- 저장소 접근 권한 확인
- 악성 파일 검사 고려

## Python

- Sandbox
- Container
- CPU 제한
- 메모리 제한
- 실행 시간 제한
- 네트워크 차단
- 프로세스 제한

## Pico

- 시뮬레이터를 실제 운영 서버와 분리
- MicroPython Runtime이 호스트 시스템에 접근하지 못하도록 제한

---

# 24. 권장 개발 순서

```text
Phase 1
기본 Frontend / Backend
        ↓
Phase 2
Firebase Google 교사 인증
        ↓
Phase 3
수업 생성 / 관리
        ↓
Phase 4
수업자료 업로드 / 다운로드
        ↓
Phase 5
PDF / 자료 Viewer
        ↓
Phase 6
Python Editor
        ↓
Phase 7
Python Sandbox 실행
        ↓
Phase 8
Python 저장 / 과제
        ↓
Phase 9
Pico 2 W 기본 시뮬레이터
        ↓
Phase 10
GPIO / LED / Button
        ↓
Phase 11
회로 편집기
        ↓
Phase 12
MicroPython Runtime
        ↓
Phase 13
센서 / 부품 추가
        ↓
Phase 14
Pico 과제 / 자동 채점
        ↓
Phase 15
교사 결과 관리
        ↓
Phase 16
보안 / 성능 / 배포
```

---

# 25. MVP 범위

첫 번째 공개 가능한 버전에서는 다음 기능만 구현한다.

## 학생

- 학생 페이지
- 수업자료 확인
- PDF 보기
- 파일 다운로드
- Python 코드 작성
- Python 실행
- Pico 2 W 기본 시뮬레이션

## 교사

- Google 로그인
- 허용된 교사 계정만 접근
- 수업 생성
- 파일 업로드
- 파일 삭제
- 수업자료 관리

## Pico

- Pico 2 W 보드
- GPIO
- LED
- Button
- 기본 MicroPython 실행

---

# 26. 2차 개발

MVP 안정화 후:

- Python 과제
- Pico 과제
- 자동 채점
- 학생별 결과
- 코드 저장
- 회로 저장
- 다양한 센서
- PWM
- ADC
- I²C
- SPI
- OLED
- LCD
- Servo
- Buzzer

---

# 27. 3차 개발

최종 교육 플랫폼으로 확장한다.

- 실시간 수업
- 학생 실습 현황
- 실시간 코드 공유
- 교사 화면
- 학습 통계
- 문제은행
- 수업 템플릿
- Pico 부품 라이브러리
- 회로 공유
- 프로젝트 공유

---

# 28. 최종 사용 흐름

```text
교사
 │
 ├── Google 로그인
 │
 ├── 수업 생성
 │
 ├── 수업자료 업로드
 │
 ├── Python 과제 생성
 │
 └── Pico 과제 생성
          │
          ▼
       학생
          │
    ┌─────┼─────┐
    │     │     │
    ▼     ▼     ▼
 자료    Python  Pico
 확인    실습    실습
    │     │     │
    │     │     └── 가상 회로 구성
    │     │
    │     └──────── 코드 실행
    │
    └────────────── 다운로드
          │
          ▼
       과제 제출
          │
          ▼
       자동 채점
          │
          ▼
       교사 확인
```

---

# 29. 최종 목표

chicode는 다음 세 가지 시스템을 하나의 웹 서비스로 통합하는 것을 목표로 한다.

```text
① 수업자료 플랫폼
+
② 온라인 Python 실습 환경
+
③ Raspberry Pi Pico 2 W 시뮬레이터
```

학생은 별도의 회원가입 없이 간단하게 실습에 참여하고, 교사는 Google 계정으로 안전하게 교사 페이지에 접근하여 수업자료와 실습을 관리하는 구조를 기본으로 한다.

특히 Pico 시뮬레이터는 처음부터 모든 기능을 구현하지 않고 **GPIO → LED → Button → MicroPython → 회로 편집기 → 센서** 순으로 확장한다.

이 방식으로 개발하면 초기 개발 범위를 크게 줄이면서도 최종적으로 Tinkercad와 유사한 교육용 Pico 시뮬레이션 환경으로 발전시킬 수 있다.
