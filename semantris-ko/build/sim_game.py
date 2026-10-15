# -*- coding: utf-8 -*-
"""The metric that matters: does the intended word win among the words actually on screen?"""
import json, numpy as np
from pathlib import Path
M=json.loads(Path('dist/meta.json').read_text(encoding='utf-8'))
T,Cl,prof=M['targets'],M['clues'],M['profiles']
Q=np.frombuffer(Path('dist/sim.bin').read_bytes(),dtype=np.uint8).reshape(M['rows'],M['cols'])
ci={c:i for i,c in enumerate(Cl)}; ti={t:j for j,t in enumerate(T)}
rng=np.random.default_rng(7)

# every (clue, target) pair we assert, drawn from the profiles themselves
pairs=[(w,t) for t,ws in prof.items() for w in ws if w in ci]
print(f"평가 쌍 {len(pairs)}개 (프로필 기반)\n")
for board in (8,12,16,24):
    wins=0; trials=0
    for clue,tgt in pairs:
        i=ci[clue]; j=ti[tgt]
        # distractors: random other targets, as a real board would be
        others=rng.choice([k for k in range(len(T)) if k!=j], size=board-1, replace=False)
        cand=np.append(others,j)
        if cand[int(np.argmax(Q[i,cand]))]==j: wins+=1
        trials+=1
    print(f"  화면 {board:2d}개 중 의도한 단어가 1위: {wins}/{trials}  ({wins/trials*100:.1f}%)")

# how often does a clue have NO decent match on a random board (dead input)?
print()
thr_pct=[50,60,70]
for board in (12,):
    for thr in thr_pct:
        dead=0; n=0
        for clue,_ in pairs[:3000]:
            i=ci[clue]
            cand=rng.choice(len(T), size=board, replace=False)
            if Q[i,cand].max() < thr: dead+=1
            n+=1
        print(f"  임계값 {thr}: 무작위 보드에서 '매칭 없음' 비율 {dead/n*100:.1f}%")
