/** 수업에서 바로 쓰는 예제 코드. 여기에 추가하면 실습 화면의 목록에 그대로 나온다. */
export interface Example {
  name: string
  code: string
  stdin: string
}

export const EXAMPLES: Example[] = [
  {
    name: '1. 첫 프로그램',
    stdin: '',
    code: `# CHICODE Python 실습
# 실행 버튼을 누르거나 Ctrl(⌘) + Enter 를 눌러보세요.

print("안녕하세요, CHICODE!")

for i in range(1, 4):
    print(f"{i}번째 줄")
`,
  },
  {
    name: '2. 입력 받기',
    stdin: '치코드\n15',
    code: `# 왼쪽 아래 "입력값" 칸에 적어둔 내용을 input() 이 위에서부터 읽습니다.

name = input("이름: ")
age = int(input("나이: "))

print(f"{name}님은 내년에 {age + 1}살이 됩니다.")
`,
  },
  {
    name: '3. 구구단',
    stdin: '',
    code: `dan = 7

for i in range(1, 10):
    print(f"{dan} x {i} = {dan * i}")
`,
  },
  {
    name: '4. 리스트와 평균',
    stdin: '',
    code: `scores = [88, 92, 79, 95, 63]

print("점수:", scores)
print("가장 높은 점수:", max(scores))
print("가장 낮은 점수:", min(scores))
print("평균:", sum(scores) / len(scores))

passed = [s for s in scores if s >= 80]
print("80점 이상:", passed)
`,
  },
  {
    name: '5. 오류 확인해 보기',
    stdin: '',
    code: `# 일부러 틀린 코드입니다. 실행하면 몇 번째 줄이 잘못됐는지 알려줍니다.

numbers = [1, 2, 3]
print(numbers[5])
`,
  },
  {
    name: '6. 무한 루프 (중지 버튼 연습)',
    stdin: '',
    code: `# 실행하면 멈추지 않습니다. 빨간 "중지" 버튼으로 끊어보세요.

count = 0
while True:
    count += 1
`,
  },
]
