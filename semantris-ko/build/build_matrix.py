# -*- coding: utf-8 -*-
"""Embed targets and clues, then emit a sparse clue -> target distance table.

Only pairs at or above KEEP_MIN are stored. Per clue that is a handful of targets out of
486 (median 4), so the table ships about ten times smaller than the dense matrix and the
vocabulary can be correspondingly larger. Anything not stored is, by construction, below
the match threshold — the game treats a missing pair as "no match".
"""
import base64, json, re, struct, sys, warnings
from pathlib import Path
import numpy as np
warnings.filterwarnings("ignore")
from sentence_transformers import SentenceTransformer

MODEL    = 'nlpai-lab/KURE-v1'
W_PROF   = 0.5     # weight of the profile-expanded similarity
BONUS    = 0.18    # additive bonus when the clue is explicitly listed in a profile
LEX_PEN  = 0.25    # penalty for syllable overlap: kills rhyme matches (경관 -> 왕관)
KEEP_MIN = 118     # quantised floor for storage, kept under the game's threshold of 130
MATCH_MIN = 130
HANGUL   = re.compile(r'^[가-힣]+$')
OUT      = Path('dist'); OUT.mkdir(exist_ok=True)
CACHE    = Path('build/emb_cache.npz')

targets = [w for w in Path('data/targets.clean.txt').read_text(encoding='utf-8').split() if w]

profiles = {}
for line in Path('data/profiles.txt').read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if not line or line.startswith('#') or ':' not in line:
        continue
    k, v = line.split(':', 1); k = k.strip()
    profiles.setdefault(k, [])
    profiles[k] += [w for w in v.split() if HANGUL.match(w) and w not in profiles[k]]
missing = [t for t in targets if t not in profiles]
assert not missing, f"profile missing for: {missing}"

clues = sorted({w for w in Path('data/clues.txt').read_text(encoding='utf-8').split() if w})
prof_texts = [f"{t}: {' '.join(profiles[t])}" for t in targets]
print(f"타깃 {len(targets):,}  단서 {len(clues):,}", flush=True)

# ---- embeddings, cached per string so a vocabulary change only costs the new words ----
cache = {}
if CACHE.exists():
    z = np.load(CACHE, allow_pickle=True)
    cache = {k: v for k, v in zip(z['keys'].tolist(), z['vecs'])}
    print(f"캐시 {len(cache):,}개 재사용", flush=True)

need = [t for t in (targets + prof_texts + clues) if t not in cache]
if need:
    print(f"새로 임베딩할 항목 {len(need):,}개", flush=True)
    model = SentenceTransformer(MODEL, device='cpu')
    B = 64
    for i in range(0, len(need), B):
        chunk = need[i:i+B]
        vecs = model.encode(chunk, normalize_embeddings=True, batch_size=B,
                            show_progress_bar=False, convert_to_numpy=True).astype(np.float32)
        for w, v in zip(chunk, vecs):
            cache[w] = v
        if (i // B) % 20 == 0:
            print(f"  {min(i+B, len(need)):,}/{len(need):,}", flush=True)
    keys = np.array(list(cache.keys()), dtype=object)
    np.savez(CACHE, keys=keys, vecs=np.stack([cache[k] for k in keys]))
    print("캐시 저장 완료", flush=True)

T_bare = np.stack([cache[t] for t in targets])
T_prof = np.stack([cache[t] for t in prof_texts])
C      = np.stack([cache[c] for c in clues])

def centre(A, B):
    """Remove the shared mean direction, the cause of hub words, then renormalise."""
    mu = np.vstack([A, B]).mean(0)
    A, B = A - mu, B - mu
    A /= np.linalg.norm(A, axis=1, keepdims=True)
    B /= np.linalg.norm(B, axis=1, keepdims=True)
    return A, B

Tb, Cb = centre(T_bare.copy(), C.copy())
Tp, Cp = centre(T_prof.copy(), C.copy())
S = (1 - W_PROF) * (Cb @ Tb.T) + W_PROF * (Cp @ Tp.T)

cidx = {c: i for i, c in enumerate(clues)}
pairs = 0
for j, t in enumerate(targets):
    for w in profiles[t]:
        i = cidx.get(w)
        if i is not None:
            S[i, j] += BONUS; pairs += 1
print(f"명시적 연상 쌍 {pairs:,}개 반영", flush=True)

tsets = [set(t) for t in targets]
for i, c in enumerate(clues):
    cs = set(c)
    row = S[i]
    for j, ts in enumerate(tsets):
        u = len(cs | ts)
        if u:
            row[j] -= LEX_PEN * (len(cs & ts) / u)
print(f"음절 중복 페널티 적용 (λ={LEX_PEN})", flush=True)

lo, hi = float(np.percentile(S, 0.5)), float(np.percentile(S, 99.95))
Q = np.clip(np.round((S - lo) / (hi - lo) * 255.0), 0, 255).astype(np.uint8)

# ---- sparse: keep only what could ever beat the threshold ----
mask = Q >= KEEP_MIN
counts = mask.sum(1)
order = np.argsort(-Q.astype(np.int16), axis=1)   # int16: negating uint8 wraps mod 256
offsets = np.zeros(len(clues) + 1, dtype=np.uint32)
ids_all, scores_all = [], []
for i in range(len(clues)):
    k = int(counts[i])
    sel = order[i, :k]                       # already sorted strongest first
    ids_all.append(sel.astype(np.uint16))
    scores_all.append(Q[i, sel])
    offsets[i+1] = offsets[i] + k
ids = np.concatenate(ids_all) if ids_all else np.zeros(0, np.uint16)
scores = np.concatenate(scores_all) if scores_all else np.zeros(0, np.uint8)
nnz = int(offsets[-1])
print(f"저장 쌍 {nnz:,}  (단서당 평균 {nnz/len(clues):.1f}, 최대 {counts.max()})", flush=True)

blob = (struct.pack('<III', 0x4B534D31, len(clues), nnz)
        + offsets.tobytes() + ids.tobytes() + scores.tobytes())
b64 = base64.b64encode(blob).decode('ascii')
(OUT / 'sim.csr.b64.txt').write_text(b64, encoding='ascii')

cats, cur, order_c = {}, None, []
for line in Path('data/targets.txt').read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line.startswith('#'):
        cur = line.lstrip('#').strip()
        if cur not in order_c: order_c.append(cur)
    elif line:
        for w in line.split(): cats.setdefault(w, cur)

(OUT / 'game.json').write_text(json.dumps({
    'targets': targets, 'clues': clues,
    'surface': json.loads(Path('data/surface.json').read_text(encoding='utf-8')),
    'profiles': profiles,
    'categories': order_c, 'catOf': [order_c.index(cats[t]) for t in targets],
    'matchMin': MATCH_MIN, 'keepMin': KEEP_MIN, 'model': MODEL,
}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

# the analysis scripts still want the dense matrix
(OUT / 'sim.bin').write_bytes(Q.tobytes())
(OUT / 'meta.json').write_text(json.dumps({
    'model': MODEL, 'targets': targets, 'clues': clues, 'rows': len(clues), 'cols': len(targets),
    'lo': lo, 'hi': hi, 'profiles': profiles,
}, ensure_ascii=False), encoding='utf-8')

print(f"\nsim.csr.b64.txt {len(b64)/1e6:.2f} MB   game.json {(OUT/'game.json').stat().st_size/1e6:.2f} MB")
print(f"(참고: 조밀 행렬이었다면 base64 {len(clues)*len(targets)*4/3/1e6:.1f} MB)")
