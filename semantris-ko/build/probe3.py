import sys, warnings, numpy as np
warnings.filterwarnings("ignore")
from sentence_transformers import SentenceTransformer

TARGETS = ['해변','바다','사막','병원','학교','고양이','자동차','피아노','겨울','커피',
           '축구','우산','도서관','비행기','김치','달','불','의사','빵','산']

# association profiles, deliberately EXCLUDING every held-out clue below
PROFILES = {
 '해변':'해수욕장 피서지 선탠 파라솔 비치타올 수영복 조개껍데기 갈매기 해안선 밀물',
 '바다':'대양 어선 항해 수평선 심해 해류 고래 소금물 선박 어업',
 '사막':'낙타 오아시스 선인장 모래폭풍 건조 사하라 유목민 신기루 황무지 일사병',
 '병원':'진료 입원 수술실 응급실 간호 환자 처방 링거 의료진 청진기',
 '학교':'교실 수업 선생님 칠판 교과서 급식 운동회 방학 숙제 교복',
 '고양이':'냥이 발톱 그루밍 집사 캣타워 생선 쥐잡기 애교 길냥이 수염',
 '자동차':'운전 엔진 타이어 주차장 도로 기름 핸들 속도 정비소 교통',
 '피아노':'연주 악보 선율 조율 그랜드 독주회 화음 음악가 흑백 페달',
 '겨울':'추위 난로 목도리 장갑 스키 성탄절 동면 빙판 히터 패딩',
 '커피':'원두 에스프레소 라떼 바리스타 카페 아메리카노 로스팅 드립 머그잔 각성',
 '축구':'골키퍼 패스 드리블 페널티 경기장 11명 리그 심판 슈팅 손흥민',
 '우산':'빗방울 접이식 비옷 손잡이 방수 젖다 현관 꽂이 양산 소나기',
 '도서관':'대출 열람실 사서 서가 조용 독서 반납 자료 공부 서적',
 '비행기':'이륙 활주로 승무원 기내 조종사 항공사 좌석 날개 수하물 고도',
 '김치':'배추 담그다 발효 항아리 포기 양념 겉절이 깍두기 반찬 젓갈',
 '달':'위성 초승 월식 분화구 밤하늘 착륙 토끼 조수 월광 아폴로',
 '불':'화재 연소 장작 소방 재 연기 성냥 모닥 화상 점화',
 '의사':'진찰 가운 전공 외과 처방전 수련 환자 검진 메스 내과',
 '빵':'제빵 반죽 오븐 효모 바게트 토스트 밀가루 베이커리 식빵 크루아상',
 '산':'봉우리 정상 암벽 산맥 하이킹 능선 고산 산장 계곡물 표고',
}
# held-out clues: none appear in the profiles above
TESTS = [('모래','해변/사막'),('파도','바다'),('주사','병원/의사'),('야옹','고양이'),
         ('건반','피아노'),('눈사람','겨울'),('카페인','커피'),('월드컵','축구'),
         ('장마','우산'),('책','도서관'),('공항','비행기'),('매운맛','김치'),
         ('보름','달'),('뜨겁다','불'),('등산','산'),('수영','해변/바다'),
         ('백신','병원/의사'),('졸업','학교'),('딸기잼','빵'),('주차','자동차')]

MODELS = sys.argv[1:] or ['jhgan/ko-sroberta-multitask']

for name in MODELS:
    print(f"\n=== {name} ===", flush=True)
    try:
        m = SentenceTransformer(name, device='cpu')
    except Exception as e:
        print("LOAD FAIL:", str(e)[:200]); continue

    def emb(xs):
        return m.encode(xs, normalize_embeddings=True, show_progress_bar=False,
                        batch_size=16, convert_to_numpy=True)

    clue_v = emb([c for c, _ in TESTS])
    variants = {
        'bare word':      [t for t in TARGETS],
        'word+profile':   [f"{t}: {PROFILES[t]}" for t in TARGETS],
        'profile only':   [PROFILES[t] for t in TARGETS],
    }
    cache={}
    for label, texts in variants.items():
        tv = emb(texts); cache[label]=tv
        for centered in (False, True):
            T, C = tv.copy(), clue_v.copy()
            if centered:
                mu = np.vstack([T, C]).mean(0)
                T = T - mu; C = C - mu
                T /= np.linalg.norm(T, axis=1, keepdims=True)
                C /= np.linalg.norm(C, axis=1, keepdims=True)
            S = C @ T.T
            hits = 0; wrong = []
            for i, (clue, exp) in enumerate(TESTS):
                order = np.argsort(-S[i])
                top = TARGETS[order[0]]
                if top in exp.split('/'): hits += 1
                else: wrong.append(f"{clue}→{top}")
            tag = 'centered' if centered else 'raw     '
            print(f"  {label:14s} {tag}  {hits:2d}/{len(TESTS)}   {' '.join(wrong[:6])}", flush=True)

    # ensemble: centered bare-word similarity + centered word+profile similarity
    def cen(T,C):
        mu=np.vstack([T,C]).mean(0); T=T-mu; C=C-mu
        return T/np.linalg.norm(T,axis=1,keepdims=True), C/np.linalg.norm(C,axis=1,keepdims=True)
    for w in (0.3,0.5,0.7):
        Tb,Cb=cen(cache['bare word'].copy(), clue_v.copy())
        Tp,Cp=cen(cache['word+profile'].copy(), clue_v.copy())
        S=(1-w)*(Cb@Tb.T)+w*(Cp@Tp.T)
        hits=0; wrong=[]
        for i,(clue,exp) in enumerate(TESTS):
            top=TARGETS[int(np.argmax(S[i]))]
            if top in exp.split('/'): hits+=1
            else: wrong.append(f"{clue}→{top}")
        print(f"  ensemble w={w:.1f}            {hits:2d}/{len(TESTS)}   {' '.join(wrong[:6])}", flush=True)
