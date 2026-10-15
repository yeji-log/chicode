# -*- coding: utf-8 -*-
"""Grid-search the profile weight and the syllable-overlap penalty."""
import json, warnings, numpy as np, itertools
from pathlib import Path
warnings.filterwarnings('ignore')
from sentence_transformers import SentenceTransformer

CACHE = Path('build/emb_cache.npz')
targets=[w for w in Path('data/targets.clean.txt').read_text(encoding='utf-8').split() if w]
profiles={}
for line in Path('data/profiles.txt').read_text(encoding='utf-8').splitlines():
    line=line.strip()
    if not line or line.startswith('#') or ':' not in line: continue
    k,v=line.split(':',1); k=k.strip()
    profiles.setdefault(k,[])
    profiles[k]+= [w for w in v.split() if w not in profiles[k]]
clues=sorted(set(Path('data/clues.txt').read_text(encoding='utf-8').split())
             | {w for ws in profiles.values() for w in ws} | set(targets))

if CACHE.exists():
    z=np.load(CACHE); T_bare,T_prof,C=z['tb'],z['tp'],z['c']
    assert len(C)==len(clues)
else:
    m=SentenceTransformer('nlpai-lab/KURE-v1', device='cpu')
    e=lambda xs: m.encode(xs, normalize_embeddings=True, batch_size=64,
                          show_progress_bar=False, convert_to_numpy=True).astype(np.float32)
    T_bare=e(targets); T_prof=e([f"{t}: {' '.join(profiles[t])}" for t in targets]); C=e(clues)
    np.savez(CACHE, tb=T_bare, tp=T_prof, c=C)

def centre(A,B):
    mu=np.vstack([A,B]).mean(0); A,B=A-mu,B-mu
    A/=np.linalg.norm(A,axis=1,keepdims=True); B/=np.linalg.norm(B,axis=1,keepdims=True)
    return A,B
Tb,Cb=centre(T_bare.copy(),C.copy()); Tp,Cp=centre(T_prof.copy(),C.copy())
S_bare=Cb@Tb.T; S_prof=Cp@Tp.T

# syllable-overlap Jaccard between every clue and every target
J=np.zeros((len(clues),len(targets)),dtype=np.float32)
tsets=[set(t) for t in targets]
for i,c in enumerate(clues):
    cs=set(c)
    for j,ts in enumerate(tsets):
        u=len(cs|ts)
        if u: J[i,j]=len(cs&ts)/u

ci={c:i for i,c in enumerate(clues)}; ti={t:j for j,t in enumerate(targets)}
BONUS=np.zeros_like(J)
for t,ws in profiles.items():
    for w in ws:
        if w in ci: BONUS[ci[w],ti[t]]=1.0

pairs=[(ci[w],ti[t]) for t,ws in profiles.items() for w in ws if w in ci]
PI=np.array([p[0] for p in pairs]); PJ=np.array([p[1] for p in pairs])
rng=np.random.default_rng(7)
BOARD=12
boards=np.stack([rng.choice(len(targets),size=BOARD-1,replace=False) for _ in range(len(pairs))])

# lexical traps: these must NOT come out on top
TRAPS=[('경관','왕관'),('달걀','달팽이'),('비꼬다','비빔밥'),('비꼬다','비둘기'),('비꼬다','비누'),
       ('방아쇠','열쇠'),('방아쇠','자물쇠'),('모으다','모자'),('모으다','모래'),('자막','자판'),
       ('조나','바나나'),('절반','절망'),('이교도','이불'),('로그','로프'),('신장','간장'),
       ('데모','드럼'),('덤비다','달팽이'),('매일','생일'),('세대','차'),('위탁','위성'),
       ('생계','계란'),('꼬마','까마귀'),('징후','신호등'),('태우다','비빔밥')]
TRAPS=[(ci[a],ti[b]) for a,b in TRAPS if a in ci and b in ti]
# legitimate compounds that MUST survive the penalty
KEEP=[('등산','산'),('눈사람','눈'),('고추장','고추장'),('해수욕장','해변'),('소고기','소'),
      ('물고기','물고기'),('장독','된장'),('촛불','양초'),('빗방울','비'),('꽃잎','꽃'),
      ('손가락','손가락'),('눈송이','눈'),('달빛','달'),('바닷길','섬')]
KEEP=[(ci[a],ti[b]) for a,b in KEEP if a in ci and b in ti]

print(f"{'w_prof':>7} {'bonus':>6} {'λ_lex':>6} | {'보드12 정확도':>12} {'함정회피':>9} {'복합어유지':>10}")
best=None
for wp, bo, lam in itertools.product((0.4,0.5,0.6),(0.18,0.25),(0.0,0.15,0.25,0.35)):
    S=(1-wp)*S_bare + wp*S_prof + bo*BONUS - lam*J
    rows=S[PI]
    cand=np.concatenate([boards, PJ[:,None]],axis=1)
    picked=np.take_along_axis(rows,cand,axis=1).argmax(1)
    acc=(cand[np.arange(len(PJ)),picked]==PJ).mean()
    trap_ok=np.mean([S[i].argmax()!=j for i,j in TRAPS])
    keep_ok=np.mean([np.argsort(-S[i])[:3].tolist().count(j)>0 for i,j in KEEP])
    score=acc+trap_ok+keep_ok
    flag=''
    if best is None or score>best[0]: best=(score,wp,bo,lam); flag=' <-'
    print(f"{wp:7.1f} {bo:6.2f} {lam:6.2f} | {acc*100:11.1f}% {trap_ok*100:8.1f}% {keep_ok*100:9.1f}%{flag}")
print(f"\n최적: w_prof={best[1]} bonus={best[2]} λ_lex={best[3]}")
