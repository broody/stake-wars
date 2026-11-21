import { readFileSync } from 'node:fs';
import { scoreReplay } from '../src/game/survivors/rankedReplay';

const bytes = readFileSync(0);
try {
  console.log(JSON.stringify(scoreReplay(Number(process.argv[2]), bytes)));
} catch {
  process.exitCode = 2;
}
