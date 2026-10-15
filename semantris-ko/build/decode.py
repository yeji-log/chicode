# -*- coding: utf-8 -*-
"""Rebuild dist/sim.bin from the committed base64 copy, for the analysis scripts."""
import base64, pathlib
src = pathlib.Path('dist/sim.b64.txt')
out = pathlib.Path('dist/sim.bin')
out.write_bytes(base64.b64decode(src.read_text(encoding='ascii')))
print(f"{out} {out.stat().st_size/1e6:.2f} MB")
