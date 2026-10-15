# -*- coding: utf-8 -*-
"""Extract a clean Korean clue vocabulary (nouns + predicate lemmas) from a frequency list."""
import re, sys, json
from pathlib import Path
from kiwipiepy import Kiwi

freq_path = Path(sys.argv[1])
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 12000

kiwi = Kiwi()
HANGUL = re.compile(r'^[가-힣]+$')

FUNC_VERBS = set('''
괜찮다 위하다 대하다 보이다 죽이다 나오다 만나다 만들다 나가다 기다리다 보내다 좋아하다 들어가다
일어나다 가지다 떠나다 돌아오다 원하다 돌아가다 부르다 끝나다 도와주다 미치다 그러다 이러다 저러다
생각하다 말하다 시작하다 그만두다 데려가다 데려오다 집어넣다 가져오다 가져가다 내려가다 올라가다
들어오다 나타나다 사라지다 변하다 바뀌다 지나가다 다가오다 어쩌다 어떡하다 그렇다 이렇다 저렇다
고맙다 미안하다 반갑다 죄송하다 괜찮다 됐다 맞다 틀리다 아니다 싶다 말다 버리다 두다 치다 놓다
하여다 당하다 시키다 삼다 여기다 느끼다 알아보다 살펴보다 쳐다보다 바라보다 들여다보다
'''.split())

STOP = set('''사람 사람들 그것 이것 저것 때문 경우 정도 자신 자기 당신 여기 거기 저기 이번 다음 지난
생각 얘기 이야기 소리 모습 모양 때 곳 것 수 줄 리 바 데 뿐 등 들 분 명 개 번 살 원 시 초 년 월 일 주 중 후 전 간 쪽
누구 어디 언제 얼마 무엇 아무 모두 전부 서로 자꾸 다시 벌써 아직 이제 지금 오늘 내일 어제 방금 금방
있다 없다 하다 되다 같다 아니다 이렇다 그렇다 어떻다 그러다 이러다 저러다 드리다 주다 받다 가다 오다 보다 알다 모르다
씨 님 네 야 응 어 아 음 흠 원래 사실 진짜 정말 완전 엄청 조금 약간 거의 전혀 절대 제발 아마 혹시
남자 여자 아이 어른 애들 녀석 자식 인간 놈 년 분들 여러분'''.split())

# surface frequency, aggregated onto lemmas
lemma_freq, surface_map = {}, {}

def add(lemma, count, surface):
    if not HANGUL.match(lemma) or len(lemma) < 2 or lemma in STOP or lemma in FUNC_VERBS:
        return
    lemma_freq[lemma] = lemma_freq.get(lemma, 0) + count
    # remember the inflected surface form so the game can resolve typed input
    if surface != lemma and HANGUL.match(surface):
        prev = surface_map.get(surface)
        if prev is None or count > prev[1]:
            surface_map[surface] = (lemma, count)

for line in freq_path.read_text(encoding='utf-8').splitlines():
    p = line.split()
    if len(p) != 2:
        continue
    surface, count = p[0], int(p[1])
    if not HANGUL.match(surface) or count < 15:
        continue
    toks = kiwi.tokenize(surface)
    tags = [t.tag for t in toks]
    # a single noun, optionally followed by particles only
    if any(t.tag == 'NNP' for t in toks):
        continue
    nouns = [t for t in toks if t.tag == 'NNG']
    rest  = [t for t in toks if t.tag != 'NNG']
    if len(nouns) == 1 and all(t.tag.startswith('J') for t in rest):
        add(nouns[0].form, count, surface)
    # compound of two nouns and nothing else -> keep the compound
    elif len(nouns) == 2 and all(t.tag.startswith('J') for t in rest) and len(toks) <= 3:
        add(''.join(n.form for n in nouns), count, surface)
    # predicate -> dictionary form (뜨겁 + 다)
    elif toks and toks[0].tag.startswith(('VA', 'VV')) and len(toks[0].form) >= 2:
        add(toks[0].form + '다', count, surface)

targets = [w for w in Path('data/targets.clean.txt').read_text().split() if w]
ranked = sorted(lemma_freq.items(), key=lambda kv: -kv[1])
vocab = {w for w, _ in ranked[:LIMIT]} | set(targets)
vocab = sorted(vocab)

Path('data/clues.txt').write_text('\n'.join(vocab) + '\n', encoding='utf-8')
# only keep surface forms that resolve to a word we actually kept
sm = {s: l for s, (l, _) in surface_map.items() if l in set(vocab) and s not in set(vocab)}
Path('data/surface.json').write_text(json.dumps(sm, ensure_ascii=False), encoding='utf-8')

print(f"표제어 추출 {len(lemma_freq)}  →  단서 어휘 {len(vocab)}   활용형 맵 {len(sm)}")
print("상위 50:", ' '.join(w for w, _ in ranked[:50]))
print("3000위대:", ' '.join(w for w, _ in ranked[3000:3030]))
print("9000위대:", ' '.join(w for w, _ in ranked[9000:9030]))
