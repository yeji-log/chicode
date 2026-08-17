/**
 * public/ 에 있는 파일의 주소를 만든다.
 *
 * 배포처마다 앱이 놓이는 경로가 다르다.
 *   Firebase Hosting → https://chicode-b5713.web.app/        (base '/')
 *   GitHub Pages     → https://yeji-log.github.io/chicode/   (base '/chicode/')
 *
 * "/chicode.png" 처럼 슬래시로 시작하는 주소를 그대로 쓰면 GitHub Pages 에서
 * 도메인 최상위를 가리켜 이미지가 깨진다. 항상 이 함수를 거친다.
 */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
