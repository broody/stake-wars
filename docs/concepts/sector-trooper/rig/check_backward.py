"""Check backward toe contacts, loop seam, flight and backward lean."""
from pathlib import Path
p = Path(__file__).resolve().parent/'check_walk.py'
CLIP = 'Backward'
exec(compile(p.read_text(),str(p),'exec'))
