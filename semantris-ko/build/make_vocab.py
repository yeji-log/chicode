# -*- coding: utf-8 -*-
"""Build the clue vocabulary.

Two sources, each doing what it is good at:
  - a Korean dictionary list decides what counts as a real word (kills subtitle
    character names, typos and fragments),
  - a frequency corpus decides which real words are common enough to be worth shipping.
Kiwi lemmatises the corpus first, so inflected surface forms collapse onto their lemma
and the inflections become a lookup table the game uses to resolve what the player types.
"""
import re, sys, json
from pathlib import Path
from kiwipiepy import Kiwi

freq_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('data/full.txt')
dict_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('data/dict.txt')
LIMIT     = int(sys.argv[3]) if len(sys.argv) > 3 else 30000
MIN_FREQ  = 3

kiwi = Kiwi()
HANGUL = re.compile(r'^[가-힣]+$')

# Only genuine function words. Everything else — 사람, 인간, 남자, 생각 — is a word a
# player may reasonably type, so it belongs in the vocabulary; the match threshold,
# not the word list, decides whether it hits anything.
STOP = set('''것 거 수 줄 리 바 데 뿐 채 등 들 분 쪽 년 월 일 시 초 때 곳 중 후 전 간 내 외 상 하
그것 이것 저것 여기 거기 저기 이거 그거 저거 무엇 누구 어디 언제 얼마 자기 자신 서로
나 너 저 우리 저희 당신 그들 이들 그녀 그이 누가 아무 아무것
하다 되다 있다 없다 같다 아니다 이렇다 그렇다 어떻다 그러다 이러다 저러다 드리다 싶다 말다
씨 님 분들 여러분 거야 거지 건지 걸까
'''.split())

# predicate endings that mean the token is an inflected form, not a lemma
VERBISH = re.compile(r'(어요|아요|예요|에요|어서|아서|는데|은데|니까|잖아|겠어|더라|구나|'
                     r'세요|시죠|지요|라고요|대요|네요|군요|거든|더군|려고|'
                     r'었어|았어|았다|었다|겠다|린다|한다|된다)$')

print("사전 목록 읽는 중…", flush=True)
DICT = {w for w in dict_path.read_text(encoding='utf-8').split() if HANGUL.match(w)}
print(f"  사전 표제어 {len(DICT):,}", flush=True)

lemma_freq, surface_map = {}, {}

def add(lemma, count, surface):
    if not HANGUL.match(lemma) or not (2 <= len(lemma) <= 7) or lemma in STOP:
        return
    lemma_freq[lemma] = lemma_freq.get(lemma, 0) + count
    if surface != lemma and HANGUL.match(surface):
        prev = surface_map.get(surface)
        if prev is None or count > prev[1]:
            surface_map[surface] = (lemma, count)

print("빈도 목록 형태소 분석 중…", flush=True)
lines = freq_path.read_text(encoding='utf-8').splitlines()
for n, line in enumerate(lines):
    if n % 100000 == 0 and n:
        print(f"  {n:,}/{len(lines):,}", flush=True)
    p = line.split()
    if len(p) != 2:
        continue
    surface, count = p[0], int(p[1])
    if not HANGUL.match(surface) or count < MIN_FREQ or len(surface) > 10:
        continue
    toks = kiwi.tokenize(surface)
    if any(t.tag == 'NNP' for t in toks):      # subtitle corpora are full of character names
        continue
    nouns = [t for t in toks if t.tag == 'NNG']
    rest  = [t for t in toks if t.tag != 'NNG']
    if nouns and all(t.tag.startswith('J') for t in rest) and len(nouns) <= 2:
        add(''.join(t.form for t in nouns), count, surface)
    elif toks and toks[0].tag.startswith(('VA', 'VV')) and len(toks[0].form) >= 2:
        add(toks[0].form + '다', count, surface)

print(f"  표제어 후보 {len(lemma_freq):,}", flush=True)

# a lemma ships only if the dictionary agrees it is a word
real = {w: c for w, c in lemma_freq.items() if w in DICT and not VERBISH.search(w)}
print(f"  사전과 일치 {len(real):,}", flush=True)

targets = [w for w in Path('data/targets.clean.txt').read_text(encoding='utf-8').split() if w]
seeds   = [w for w in Path('data/seeds.txt').read_text(encoding='utf-8').split() if HANGUL.match(w)] \
          if Path('data/seeds.txt').exists() else []
profile_words = []
for line in Path('data/profiles.txt').read_text(encoding='utf-8').splitlines():
    if ':' in line and not line.startswith('#'):
        profile_words += [w for w in line.split(':', 1)[1].split() if HANGUL.match(w)]

ranked = sorted(real.items(), key=lambda kv: -kv[1])
vocab = sorted(set(w for w, _ in ranked[:LIMIT]) | set(targets) | set(seeds) | set(profile_words))

Path('data/clues.txt').write_text('\n'.join(vocab) + '\n', encoding='utf-8')
keep = set(vocab)
sm = {s: l for s, (l, _) in surface_map.items() if l in keep and s not in keep}
Path('data/surface.json').write_text(json.dumps(sm, ensure_ascii=False), encoding='utf-8')

print(f"\n단서 어휘 {len(vocab):,}   활용형 맵 {len(sm):,}")
missing = [w for w in ['인간','사람','대중교통','남자','여자','아이','생각','재활용','스마트폰',
                       '지하철역','소방차','손수건','가로등','인공지능'] if w not in keep]
print("예시 단어 누락:", ' '.join(missing) if missing else "없음")
print("상위 40:", ' '.join(w for w, _ in ranked[:40]))
