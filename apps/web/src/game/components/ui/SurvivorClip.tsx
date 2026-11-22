import { useState } from 'react';
import { Badge, Button } from '../../../ui';
import { SIM_HZ } from '../../survivors/sim';
import { survivorsSession, type ClipPlayerName } from '../../survivors/session';

/** Marks the Core as showing a recorded death rather than a live run. */
export function ClipBadge() {
  const watching = survivorsSession.watching;
  if (!survivorsSession.watchingClip || !watching) return null;
  const player = watching.player;
  return (
    <Badge tone="accent" variant="solid">
      {player && 'name' in player
        ? `DEATH REPLAY · ${player.name.toUpperCase()}`
        : 'DEATH REPLAY'}
    </Badge>
  );
}

/** Says what the results show while a clip is playing. */
export function ClipCaption() {
  const watching = survivorsSession.watching;
  if (!survivorsSession.watchingClip || !watching) return null;
  const player = watching.player;
  const whose = !player
    ? 'this'
    : 'own' in player
      ? 'your'
      : `${player.name}’s`;
  // Clips recorded before a length change keep their own length.
  const seconds = Math.round(watching.clip.end.ticks / SIM_HZ);
  return (
    <p className="border-t border-line px-5 py-3 text-caption text-fg-secondary">
      You watched the last {seconds} seconds of {whose} run. The results cover
      the whole run.
    </p>
  );
}

/** Fetches a run's death clip and plays it on the Core. */
export function WatchClipButton({
  run,
  player,
  groundRadius,
}: {
  run: number;
  player: ClipPlayerName;
  groundRadius: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function watch() {
    setBusy(true);
    setError('');
    try {
      await survivorsSession.loadClip(run, player);
      survivorsSession.start(groundRadius);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not load the death replay.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" busy={busy} onClick={() => void watch()}>
        WATCH DEATH REPLAY
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
