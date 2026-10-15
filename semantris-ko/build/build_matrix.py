# -*- coding: utf-8 -*-
"""Embed targets and clues, then emit a quantised clue x target similarity matrix."""
import json, re, struct, sys, warnings
from pathlib import Path
import numpy as np
warnings.filterwarnings("ignore")
from sentence_transformers import SentenceTransformer

MODEL   = 'nlpai-lab/KURE-v1'
W_PROF  = 0.5      # weight of the profile-expanded similarity
BONUS   = 0.18     # additive bonus when the clue is explicitly listed in a profile
LEX_PEN = 0.25     # penalty for syllable overlap: kills rhyme matches (경관 -> 왕관)
HANGUL  = re.compile(r'^[가-힣]+$')
OUT     = Path('dist'); OUT.mkdir(exist_ok=True)

targets = [w for w in Path('data/targets.clean.txt').read_text(encoding='utf-8').split() if w]

# ---- profiles (merge duplicate keys: homonyms such as 눈 / 다리) ----
profiles = {}
for line in Path('data/profiles.txt').read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if not line or line.startswith('#') or ':' not in line:
        continue
    k, v = line.split(':', 1)
    k = k.strip()
    words = [w for w in v.split() if HANGUL.match(w)]
    profiles.setdefault(k, [])
    profiles[k] += [w for w in words if w not in profiles[k]]
missing = [t for t in targets if t not in profiles]
assert not missing, f"profile missing for: {missing}"

# ---- clue vocabulary = frequency list + every profile word + every target ----
freq_clues = [w for w in Path('data/clues.txt').read_text(encoding='utf-8').split() if w]
prof_words = sorted({w for ws in profiles.values() for w in ws})
seed_path = Path('data/seeds.txt')
seeds = [w for w in seed_path.read_text(encoding='utf-8').split() if HANGUL.match(w)] if seed_path.exists() else []
clues = sorted(set(freq_clues) | set(prof_words) | set(targets) | set(seeds))
print(f"타깃 {len(targets)}  단서 {len(clues)}  (프로필 {len(prof_words)} / 보강 {len(seeds)})", flush=True)

model = SentenceTransformer(MODEL, device='cpu')
def emb(xs, label):
    print(f"  임베딩 {label} ({len(xs)})...", flush=True)
    return model.encode(xs, normalize_embeddings=True, batch_size=64,
                        show_progress_bar=False, convert_to_numpy=True).astype(np.float32)

T_bare = emb(targets, 'target bare')
T_prof = emb([f"{t}: {' '.join(profiles[t])}" for t in targets], 'target profile')
C      = emb(clues, 'clue')

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

# ---- explicit association bonus ----
cidx = {c: i for i, c in enumerate(clues)}
pairs = 0
for j, t in enumerate(targets):
    for w in profiles[t]:
        i = cidx.get(w)
        if i is not None:
            S[i, j] += BONUS
            pairs += 1
print(f"명시적 연상 쌍 {pairs}개 반영", flush=True)

# ---- syllable-overlap penalty: the model over-rewards shared syllables on short strings ----
tsets = [set(t) for t in targets]
Jm = np.zeros_like(S)
for i, c in enumerate(clues):
    cs = set(c)
    for j, ts in enumerate(tsets):
        u = len(cs | ts)
        if u:
            Jm[i, j] = len(cs & ts) / u
S -= LEX_PEN * Jm
print(f"음절 중복 페널티 적용 (λ={LEX_PEN})", flush=True)

# ---- quantise to uint8 with a global affine map ----
lo, hi = float(np.percentile(S, 0.5)), float(np.percentile(S, 99.95))
Q = np.clip(np.round((S - lo) / (hi - lo) * 255.0), 0, 255).astype(np.uint8)
# verify the quantisation preserved the ranking
exact = sum(1 for i in range(len(clues)) if int(np.argmax(Q[i])) == int(np.argmax(S[i])))
print(f"양자화 범위 [{lo:.3f}, {hi:.3f}]   1위 보존 {exact}/{len(clues)} ({exact/len(clues)*100:.1f}%)")

(OUT / 'sim.u8').write_bytes(Q.tobytes())
Path(OUT / 'meta.json').write_text(json.dumps({
    'model': MODEL, 'targets': targets, 'clues': clues,
    'rows': len(clues), 'cols': len(targets),
    'lo': lo, 'hi': hi, 'w_profile': W_PROF, 'bonus': BONUS, 'lex_pen': LEX_PEN,
    'surface': json.loads(Path('data/surface.json').read_text(encoding='utf-8'))
               if Path('data/surface.json').exists() else {},
    'profiles': profiles,
}, ensure_ascii=False), encoding='utf-8')
print(f"sim.u8 {len(Q.tobytes())/1e6:.2f} MB   meta.json {(OUT/'meta.json').stat().st_size/1e6:.2f} MB")
