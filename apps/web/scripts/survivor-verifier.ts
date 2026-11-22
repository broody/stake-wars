import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { scoreReplay } from '../src/game/survivors/rankedReplay';

function score(seed: number, bytes: Uint8Array) {
  try {
    return scoreReplay(seed, bytes, { clip: true });
  } catch {
    return null;
  }
}

const result = score(Number(process.argv[2]), readFileSync(0));
if (!result) {
  process.exitCode = 2;
} else {
  // Scoring keeps a death clip only if it replays to the run's exact end.
  const { clip, ...verified } = result;
  console.log(
    JSON.stringify({
      ...verified,
      clip: clip ? gzipSync(JSON.stringify(clip)).toString('base64') : null,
    })
  );
}
