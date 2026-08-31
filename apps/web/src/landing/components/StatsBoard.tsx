import { useEffect, useState } from 'react';
import {
  formatStrkAmount,
  getLandingStats,
  type LandingStats,
} from '../services/stats';

interface StatItemProps {
  label: string;
  value: string;
}

const StatItem = ({ label, value }: StatItemProps) => {
  return (
    <div className="stat-item border-b border-dim p-5 text-center last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="stat-label text-[0.8rem] text-[#888] mb-1">{label}</div>
      <div className="stat-value text-[1.5rem] font-bold text-[#ccc]">
        {value}
      </div>
    </div>
  );
};

export const StatsBoard = () => {
  const [stats, setStats] = useState<LandingStats | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getLandingStats(controller.signal)
      .then((snapshot) => {
        setStats(snapshot);
        setIsUnavailable(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setIsUnavailable(true);
      });
    return () => controller.abort();
  }, []);

  const fallback = isUnavailable ? 'UNAVAILABLE' : 'SYNCING';

  return (
    <div
      aria-live="polite"
      className="stats-board mb-20 grid grid-cols-1 border border-dim bg-black/60 opacity-80 md:grid-cols-3"
    >
      <StatItem
        label="TOTAL STAKED"
        value={stats ? `${formatStrkAmount(stats.totalStaked)} STRK` : fallback}
      />
      <StatItem
        label="ACTIVE OPERATORS"
        value={stats ? stats.activeOperators.toLocaleString('en-US') : fallback}
      />
      <StatItem
        label="SECTORS OCCUPIED"
        value={stats ? stats.occupiedSectors.toLocaleString('en-US') : fallback}
      />
    </div>
  );
};
