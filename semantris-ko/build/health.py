# -*- coding: utf-8 -*-
"""Pick a model by embedding health over the real vocabulary, not a toy probe."""
import sys, json, warnings, numpy as np
from pathlib import Path
warnings.filterwarnings('ignore')
from sentence_transformers import SentenceTransformer

clues = [w for w in Path('data/clues.txt').read_text(encoding='utf-8').split() if w]
rng = np.random.default_rng(0)
sample = sorted(rng.choice(clues, size=min(1600, len(clues)), replace=False).tolist())
WATCH = ['기저귀','수갑','토너','페달','안장','유산균','리모컨','대패','곡괭이','짹짹',
         '에스컬레이터','원두','배추','칠판','덩크','홈런','용암','낙타','상아','올챙이']
sample = sorted(set(sample) | set(WATCH))

for name in sys.argv[1:]:
    print(f"\n=== {name} ===", flush=True)
    try:
        m = SentenceTransformer(name, device='cpu')
    except Exception as e:
        print("  LOAD FAIL:", str(e)[:160]); continue
    tok = m.tokenizer
    unk = sum(1 for w in sample if tok.unk_token_id in tok.encode(w, add_special_tokens=False))
    V = m.encode(sample, normalize_embeddings=True, batch_size=64,
                 show_progress_bar=False, convert_to_numpy=True)
    S = V @ V.T
    np.fill_diagonal(S, -1)
    nn = S.max(1)
    dead = int((nn > 0.995).sum())
    # how many distinct words collapse onto the single worst duplicate cluster
    worst = int(np.argmax(nn))
    clump = int((S[worst] > 0.995).sum()) + 1
    print(f"  UNK {unk}/{len(sample)}   거의동일쌍(>0.995) {dead}/{len(sample)}"
          f"   최대붕괴군 {clump}   평균최근접 {nn.mean():.3f}", flush=True)
    idx = {w: i for i, w in enumerate(sample)}
    bad = [w for w in WATCH if nn[idx[w]] > 0.995]
    print(f"  감시단어 중 붕괴: {' '.join(bad) if bad else '없음'}", flush=True)
