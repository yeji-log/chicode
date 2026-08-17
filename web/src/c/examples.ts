/** C 수업에서 바로 쓰는 예제. 여기에 추가하면 실습 화면 목록에 그대로 나온다. */
export interface Example {
  name: string
  code: string
  stdin: string
}

export const EXAMPLES: Example[] = [
  {
    name: '1. 첫 프로그램',
    stdin: '',
    code: `// CHICODE C언어 실습
// 실행 버튼을 누르거나 Ctrl(⌘) + Enter 를 눌러보세요.

#include <stdio.h>

int main() {
    printf("안녕하세요, CHICODE!\\n");

    for (int i = 1; i <= 3; i++) {
        printf("%d번째 줄\\n", i);
    }

    return 0;
}
`,
  },
  {
    name: '2. 입력 받기',
    stdin: '치코드\n15',
    code: `// 왼쪽 아래 "입력값" 칸에 적어둔 내용을 scanf 가 위에서부터 읽습니다.

#include <stdio.h>

int main() {
    char name[20];
    int age;

    scanf("%s", name);
    scanf("%d", &age);

    printf("%s님은 내년에 %d살이 됩니다.\\n", name, age + 1);
    return 0;
}
`,
  },
  {
    name: '3. 구구단',
    stdin: '',
    code: `#include <stdio.h>

int main() {
    int dan = 7;

    for (int i = 1; i <= 9; i++) {
        printf("%d x %d = %d\\n", dan, i, dan * i);
    }

    return 0;
}
`,
  },
  {
    name: '4. 배열과 평균',
    stdin: '',
    code: `#include <stdio.h>

int main() {
    int scores[5] = {88, 92, 79, 95, 63};
    int sum = 0;
    int highest = scores[0];

    for (int i = 0; i < 5; i++) {
        sum += scores[i];
        if (scores[i] > highest) highest = scores[i];
    }

    printf("가장 높은 점수: %d\\n", highest);
    printf("평균: %.1f\\n", (float)sum / 5);
    return 0;
}
`,
  },
  {
    name: '5. 함수 만들기',
    stdin: '',
    code: `#include <stdio.h>

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    for (int i = 1; i <= 5; i++) {
        printf("%d! = %d\\n", i, factorial(i));
    }
    return 0;
}
`,
  },
  {
    name: '6. 오류 확인해 보기',
    stdin: '',
    code: `// 일부러 틀린 코드입니다. 실행하면 어디가 잘못됐는지 알려줍니다.

#include <stdio.h>

int main() {
    int number = 10
    printf("%d\\n", number);
    return 0;
}
`,
  },
  {
    name: '7. 무한 루프 (중지 버튼 연습)',
    stdin: '',
    code: `// 실행하면 멈추지 않습니다. 빨간 "중지" 버튼으로 끊어보세요.

#include <stdio.h>

int main() {
    long count = 0;
    while (1) {
        count++;
    }
    return 0;
}
`,
  },
]
