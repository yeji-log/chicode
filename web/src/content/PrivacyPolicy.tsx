import PolicyArticle from '../components/PolicyArticle'

export const PRIVACY_POLICY_EFFECTIVE_DATE = '2026. 8. 21.'

/**
 * chicode 코드베이스(Firebase 인증 · Firestore · Pyodide 실행 방식 · 동아리(Lab)
 * 유튜브 영상 임베드 · 수업기록 학생 명단/참여 기록)를 실제로 확인하고 작성한
 * 개인정보처리방침이다. 법률 자문을 거친 문서는 아니다 — 2026.8.21 수업기록
 * 기능으로 학생 개인정보(학번·이름·참여 기록)를 처음 다루게 됐는데, 이건 애초에
 * 이 파일에 "서비스가 커지거나 학생 개인정보를 다루게 되면 전문가 검토를
 * 받으라"고 스스로 남겨뒀던 그 시점이다 — 미성년자 개인정보인 만큼 전문가
 * 검토를 받는 것을 권한다.
 */
export default function PrivacyPolicy() {
  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-ink-700">
        CHICODE(이하 "서비스")는 이용자의 개인정보를 소중히 다루며, 관련 법령을 준수합니다.
        이 방침은 서비스가 어떤 정보를 어떻게 다루는지 있는 그대로 알려드립니다.
      </p>

      <PolicyArticle num="제1조" title="수집하는 개인정보 항목">
        <p>
          <strong>학생</strong> — 학생은 회원가입이나 로그인 없이 서비스를 이용하며, 직접
          개인정보를 입력하거나 전송하지 않습니다. 다만 담당 교사가 수업 관리 목적으로
          학생의 학번·이름과 날짜별 수업 참여 여부를 직접 입력해 관리하는 "수업기록"
          기능이 있습니다(자세한 내용은 제8조 참고).
        </p>
        <p>
          <strong>교사</strong> — 교사가 Google 계정으로 로그인하면, Google이 제공하는
          다음 정보를 Firebase Authentication을 통해 전달받습니다.
        </p>
        <ul>
          <li>이메일 주소</li>
          <li>이름, 프로필 사진 (Google 계정에 등록되어 있는 경우)</li>
          <li>Google 계정 고유 식별자(UID)</li>
        </ul>
        <p>
          이 중 이메일 주소는 사전에 허용된 교사 계정인지 확인하는 용도로만 사용되며,
          별도로 등록된 이메일 목록과 대조됩니다.
        </p>
        <p>
          또한 교사가 수업자료·수업목차(OT) 자료를 올리거나, 동아리(Lab) 활동자료를
          작성·수정하거나, 오늘의 이슈를 발행하면 그 이메일 주소가 등록자 정보로 함께
          저장됩니다. 이 데이터는 로그인 없이도 열람할 수 있게 열려 있어, 화면에
          표시되지는 않지만 개발자도구 등을 이용하면 확인할 수 있습니다(제9조 참고).
        </p>
      </PolicyArticle>

      <PolicyArticle num="제2조" title="개인정보의 수집 및 이용 목적">
        <p>수집한 정보는 다음 목적을 위해서만 사용됩니다.</p>
        <ol>
          <li>교사 인증 — 사전에 허용된 계정만 수업자료를 올리고 지울 수 있도록 확인</li>
          <li>서비스 부정 이용 방지</li>
          <li>
            자료·이슈 등록자 관리 — 수업자료·동아리(Lab) 활동자료·오늘의 이슈를 누가
            올리고 고쳤는지 기록해 문제 발생 시 확인
          </li>
          <li>수업기록 관리 — 담당 교사가 학생의 수업 참여 여부를 날짜별로 기록·관리</li>
        </ol>
      </PolicyArticle>

      <PolicyArticle num="제3조" title="개인정보의 보유 및 이용 기간">
        <p>
          교사 계정 정보는 교사 권한 등록이 유지되는 동안 보유하며, 서비스 운영자가 등록을
          해제하면 그 즉시 삭제합니다. 별도의 정액 보유기간을 두지 않고, 목적 달성 시(등록
          해제 시)까지 보유하는 방식을 채택하고 있습니다.
        </p>
        <p>
          수업기록(학생 학번·이름·참여 기록)은 한 학기 동안 수업 관리 목적으로 보유하며,
          학기가 끝나면 담당 교사가 "기록" 화면에서 반 단위로 직접 삭제합니다. 자동으로
          삭제되는 기능은 없으며, 삭제 시점과 실행은 담당 교사의 운영 방침을 따릅니다.
        </p>
      </PolicyArticle>

      <PolicyArticle num="제4조" title="개인정보의 제3자 제공 및 처리위탁">
        <p>
          CHICODE는 이용자의 개인정보를 외부에 판매하거나 제공하지 않습니다. 다만 서비스
          운영을 위해 아래 업체에 처리를 위탁합니다.
        </p>
        <div className="my-3 overflow-x-auto rounded-lg border border-cream-deep">
          <table className="w-full min-w-[420px] border-collapse text-xs">
            <thead>
              <tr className="bg-cream-deep text-left text-ink-900">
                <th className="px-3 py-2 font-bold">수탁업체</th>
                <th className="px-3 py-2 font-bold">위탁 업무</th>
                <th className="px-3 py-2 font-bold">비고</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-cream-deep align-top">
                <td className="px-3 py-2">Google Firebase</td>
                <td className="px-3 py-2">
                  로그인 인증(Authentication), 수업자료·동아리(Lab) 활동자료·오늘의 이슈·
                  수업기록(학생 학번·이름·참여 기록) 저장(Firestore)
                </td>
                <td className="px-3 py-2 text-ink-500">
                  Firestore는 서울(asia-northeast3) 리전, Authentication은 Google 글로벌
                  인프라에서 처리됩니다.
                </td>
              </tr>
              <tr className="border-t border-cream-deep align-top">
                <td className="px-3 py-2">Vercel</td>
                <td className="px-3 py-2">웹사이트 정적 파일 호스팅 (대표 주소)</td>
                <td className="px-3 py-2 text-ink-500">Vercel Inc. 글로벌 인프라</td>
              </tr>
              <tr className="border-t border-cream-deep align-top">
                <td className="px-3 py-2">GitHub Pages</td>
                <td className="px-3 py-2">웹사이트 정적 파일 호스팅 (보조 주소)</td>
                <td className="px-3 py-2 text-ink-500">
                  GitHub(Microsoft) 인프라. 이 주소에서는 교사 로그인이 지원되지 않습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          호스팅 업체는 서비스 접속 과정에서 IP 주소, 브라우저 정보 등 접속 기록을
          표준적인 서버 로그 형태로 자동 수집할 수 있습니다. CHICODE는 이 로그를 별도로
          수집·분석·활용하지 않습니다.
        </p>
        <p>
          교사가 동아리(Lab) 활동 항목에 유튜브 영상 링크를 등록한 경우, 그 활동
          페이지에는 유튜브(운영사: Google LLC)의 임베드 플레이어가 포함됩니다. 이 경우
          페이지를 여는 것만으로 이용자의 IP 주소, 브라우저 정보 등이 재생 여부와
          무관하게 유튜브 측에 전달될 수 있습니다. 이는 CHICODE가 이용자 정보를
          유튜브에 제공하는 것이 아니라, 이용자의 브라우저가 임베드된 콘텐츠를
          불러오기 위해 유튜브 서버에 직접 접속하면서 발생하는 것이며, 유튜브의
          개인정보처리방침이 적용됩니다. CHICODE는 추적을 최소화하는
          youtube-nocookie.com 도메인으로 임베드합니다.
        </p>
        <p>
          오늘의 AI·IT 이슈는 매일 아침 GitHub Actions가 국내외 공식 기업 블로그·과학기술
          전문 매체의 공개 RSS를 자동으로 수집해 후보로 쌓아 둡니다. 이 과정에서 수집되는
          것은 기사 제목·요약·링크 등 공개된 정보뿐이며, 이용자의 개인정보는 포함되지
          않습니다. 교사가 이 중 일부를 골라 직접 요약과 설명을 써서 승인해야만
          학생 화면에 공개됩니다.
        </p>
      </PolicyArticle>

      <PolicyArticle num="제5조" title="쿠키 및 브라우저 저장소">
        <p>
          CHICODE는 이용자를 추적하기 위한 쿠키를 직접 사용하지 않습니다. 다만 제4조에서
          설명한 것처럼 유튜브 영상이 포함된 활동 페이지에서는 유튜브가 자체 정책에 따라
          쿠키를 사용할 수 있습니다.
        </p>
        <ul>
          <li>
            <strong>로그인 유지</strong> — 교사 로그인 상태는 쿠키가 아닌 브라우저
            저장소(IndexedDB)에 보관되며, Firebase Authentication이 관리합니다.
          </li>
          <li>
            <strong>실습 코드 저장</strong> — Python·C 실습 화면에서 작성한 코드와
            표준입력 값은 새로고침해도 남아 있도록 브라우저의 localStorage에 저장됩니다.
            이 정보는 이용자의 기기에만 저장되며 서버로 전송되지 않습니다.
          </li>
          <li>
            <strong>과목 잠금 해제 상태 저장</strong> — 수업자료 과목 선택 화면에서
            핀번호를 입력해 잠금을 해제하면, 그 상태는 브라우저의 sessionStorage에
            과목별로 저장됩니다. 탭이나 브라우저를 닫으면 사라지며, 공용 컴퓨터에서는
            다음 이용자가 다시 핀번호를 입력해야 합니다.
          </li>
          <li>
            <strong>동아리(Lab) 잠금 해제 상태 저장</strong> — Lab 화면 진입 시 핀번호를
            입력해 잠금을 해제하면, 그 상태도 같은 방식으로 브라우저의 sessionStorage에
            저장됩니다. 마찬가지로 탭이나 브라우저를 닫으면 사라집니다.
          </li>
          <li>
            <strong>체크리스트 표시 상태</strong> — 동아리(Lab) 활동의 체크리스트 항목을
            학생이 눌러서 표시해보는 상태는 브라우저에도 저장되지 않고 화면을 벗어나면
            사라지는, 그 화면 안에서만 유지되는 임시 상태입니다.
          </li>
        </ul>
      </PolicyArticle>

      <PolicyArticle num="제6조" title="Python·C 코드 실행에 관한 사항">
        <p>
          CHICODE의 Python·C 실습은 서버가 아니라 이용자의 브라우저 안에서 실행됩니다.
          Python은 Pyodide(WebAssembly로 컴파일된 CPython)를, C는 브라우저에서 직접
          동작하는 clang.wasm을 이용해 컴파일·링크·실행까지 전부 처리합니다. 작성한
          코드, 표준입력 값, 실행 결과 모두 CHICODE 서버로 전송되지 않으며, 별도로
          저장·수집되지 않습니다.
        </p>
      </PolicyArticle>

      <PolicyArticle num="제7조" title="이용자의 권리">
        <p>
          교사는 언제든지 Google 계정 로그아웃을 통해 서비스 이용을 중단할 수 있습니다.
          교사 계정의 등록 해제, 등록된 개인정보의 열람·정정·삭제를 원하시면 제10조의
          연락처로 문의해 주세요.
        </p>
        <p>
          학생 또는 보호자가 수업기록에 등록된 정보(학번·이름·참여 기록)의 열람·정정·삭제를
          원하시면 담당 교사 또는 제10조의 연락처로 요청하실 수 있습니다.
        </p>
      </PolicyArticle>

      <PolicyArticle num="제8조" title="아동의 개인정보">
        <p>
          학생이 서비스에 직접 개인정보를 입력하거나 전송하는 경우는 없습니다. 다만 담당
          교사가 수업 운영 목적으로 학생의 학번·이름과 날짜별 수업 참여 여부를 직접 입력해
          관리하는 "수업기록" 기능이 있습니다. 이 정보는 로그인한 교사만 열람·수정할 수
          있고 학생은 접근할 수 없으며, 담당 교사가 직접 삭제하기 전까지 보관됩니다(제3조
          참고). 이 밖에 아동의 개인정보를 수집하는 기능이 추가될 경우, 관련 법령에 따라
          법정대리인의 동의를 받는 절차를 먼저 마련한 뒤 이 방침에 반영하겠습니다.
        </p>
      </PolicyArticle>

      <PolicyArticle num="제9조" title="개인정보의 안전성 확보 조치">
        <ul>
          <li>
            교사 계정 데이터베이스(Firestore)는 인증된 요청만 접근할 수 있도록 접근
            규칙(Security Rules)으로 제한되어 있습니다.
          </li>
          <li>
            등록된 교사 목록은 본인 계정으로 로그인한 경우에만 자신의 등록 여부를 확인할
            수 있으며, 전체 목록은 공개적으로 조회할 수 없습니다.
          </li>
          <li>
            수업자료·동아리(Lab) 활동자료·오늘의 이슈에는 이를 올리거나 고친 교사의
            이메일이 등록자 정보로 함께 저장되며, 이 데이터는 다른 공개 콘텐츠와
            마찬가지로 읽기 권한이 열려 있습니다. 화면에 노출하지는 않지만, 개발자도구로
            조회하면 확인할 수 있는 정보라는 점을 알려드립니다.
          </li>
          <li>
            수업기록(학생 학번·이름·참여 기록)은 위와 달리 읽기 권한도 로그인한 교사로
            제한되어 있어, 학생을 포함해 로그인하지 않은 누구도 열람할 수 없습니다.
          </li>
        </ul>
      </PolicyArticle>

      <PolicyArticle num="제10조" title="개인정보 보호책임자">
        <p>
          서비스: CHICODE
          <br />
          담당자: 김예지
          <br />
          연락처: kyj516@sen.go.kr
        </p>
        <p>
          개인정보 처리와 관련한 문의, 불만 처리 등에 대해 위 연락처로 문의해 주시면
          신속히 답변드리겠습니다.
        </p>
      </PolicyArticle>

      <PolicyArticle num="제11조" title="개인정보처리방침의 변경">
        <p>
          이 방침은 법령, 정책 또는 서비스 내용의 변경에 따라 수정될 수 있으며, 변경 시
          이 페이지를 통해 공지합니다.
        </p>
      </PolicyArticle>

      <div className="mt-6 border-t border-cream-deep pt-4 text-xs text-ink-500">
        <p className="font-semibold text-ink-700">부칙</p>
        <p>이 방침은 {PRIVACY_POLICY_EFFECTIVE_DATE}부터 시행됩니다.</p>
      </div>
    </>
  )
}
