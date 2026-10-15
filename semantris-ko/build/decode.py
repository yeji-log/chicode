# -*- coding: utf-8 -*-
"""Rebuild dist/sim.bin (dense) from the committed sparse table, for the analysis scripts."""
import base64, json, struct, numpy as np
from pathlib import Path
g = json.loads(Path('dist/game.json').read_text(encoding='utf-8'))
blob = base64.b64decode(Path('dist/sim.csr.b64.txt').read_text(encoding='ascii'))
magic, n, nnz = struct.unpack_from('<III', blob, 0)
assert magic == 0x4B534D31, "unexpected table format"
at = 12
off = np.frombuffer(blob, np.uint32, n + 1, at); at += (n + 1) * 4
ids = np.frombuffer(blob, np.uint16, nnz, at);   at += nnz * 2
sc  = np.frombuffer(blob, np.uint8,  nnz, at)
Q = np.zeros((n, len(g['targets'])), np.uint8)
for i in range(n):
    a, b = off[i], off[i+1]
    Q[i, ids[a:b]] = sc[a:b]
Path('dist/sim.bin').write_bytes(Q.tobytes())
print(f"dist/sim.bin {Q.nbytes/1e6:.1f} MB  (임계값 미만은 0으로 채워진다)")
