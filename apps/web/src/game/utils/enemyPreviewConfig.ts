export const MAX_ENEMIES_PER_TYPE = 1000;

export interface EnemySwarmCounts {
  mites: number;
  lancers: number;
}

export const EMPTY_SWARM_COUNTS: EnemySwarmCounts = { mites: 0, lancers: 0 };

export const ENEMY_PREVIEW_TYPES = {
  mites: {
    label: 'MITES',
    modelUrl: '/models/hollow-legion/mite.glb',
    scale: 0.35,
    runSpeed: 1.008,
    seed: 4187,
  },
  lancers: {
    label: 'LANCERS',
    modelUrl: '/models/hollow-legion/lancer.glb',
    scale: 0.35,
    runSpeed: 2.7,
    seed: 7621,
  },
} as const;

export type EnemyPreviewType = keyof typeof ENEMY_PREVIEW_TYPES;

export function parseEnemySwarmCounts(
  params: URLSearchParams
): EnemySwarmCounts {
  const count = (key: EnemyPreviewType) => {
    const value = params.get(key)?.trim() ?? '';
    if (!/^\d+$/.test(value)) return 0;
    return Math.min(Number(value), MAX_ENEMIES_PER_TYPE);
  };
  return { mites: count('mites'), lancers: count('lancers') };
}
