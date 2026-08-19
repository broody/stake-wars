import { describe, expect, it } from 'vitest';
import {
  buildBatchGameActionCalls,
  buildGameActionCalls,
  incrementalCommittedForce,
  stakeDeficit,
} from './smartCapture';

const shared = {
  controlSystemAddress: '0xcontrol',
};

describe('allocation action calls', () => {
  it('builds a game action without staking calls', () => {
    expect(
      buildGameActionCalls({
        ...shared,
        entrypoint: 'challenge',
        calldata: ['7', '420'],
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'challenge',
        calldata: ['7', '420'],
      },
    ]);
  });

  it('builds a collateral sacrifice call with its liquid contribution', () => {
    expect(
      buildGameActionCalls({
        ...shared,
        entrypoint: 'challenge_with_sacrifice',
        calldata: ['7', '8', '420'],
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'challenge_with_sacrifice',
        calldata: ['7', '8', '420'],
      },
    ]);
  });

  it('builds one contract-level capture batch without staking calls', () => {
    expect(
      buildBatchGameActionCalls({
        ...shared,
        actions: [
          { entrypoint: 'capture', calldata: ['7', '100'] },
          { entrypoint: 'capture', calldata: ['8', '100'] },
          { entrypoint: 'capture', calldata: ['9', '100'] },
        ],
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture_many',
        calldata: ['3', '7', '100', '8', '100', '9', '100'],
      },
    ]);
  });

  it('builds one contract-level reinforcement batch', () => {
    expect(
      buildBatchGameActionCalls({
        ...shared,
        actions: [
          { entrypoint: 'reinforce', calldata: ['7', '25'] },
          { entrypoint: 'reinforce', calldata: ['8', '50'] },
        ],
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'reinforce_many',
        calldata: ['2', '7', '25', '8', '50'],
      },
    ]);
  });

  it('keeps a one-sector batch on the single-sector entrypoint', () => {
    expect(
      buildBatchGameActionCalls({
        ...shared,
        actions: [{ entrypoint: 'capture', calldata: ['7', '100'] }],
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'capture',
        calldata: ['7', '100'],
      },
    ]);
  });

  it('rejects mixed action types in one contract batch', () => {
    expect(() =>
      buildBatchGameActionCalls({
        ...shared,
        actions: [
          { entrypoint: 'capture', calldata: ['7', '100'] },
          { entrypoint: 'reinforce', calldata: ['8', '100'] },
        ],
      })
    ).toThrow('Batch Sector actions must have the same type');
  });

  it('rejects an empty batch', () => {
    expect(() =>
      buildBatchGameActionCalls({
        ...shared,
        actions: [],
      })
    ).toThrow('At least one Sector action is required');
  });

  it('rejects a batch larger than the contract limit', () => {
    expect(() =>
      buildBatchGameActionCalls({
        ...shared,
        actions: Array.from({ length: 201 }, (_, id) => ({
          entrypoint: 'capture' as const,
          calldata: [id.toString(), '100'],
        })),
      })
    ).toThrow('At most 200 Sector actions are allowed');
  });
});

describe('staking arithmetic', () => {
  it('locks only the increase over an operator previous challenge commitment', () => {
    expect(incrementalCommittedForce(700n, 500n)).toBe(200n);
    expect(incrementalCommittedForce(500n, 500n)).toBe(0n);
  });

  it('stakes only the portion of a selected allocation that is unavailable', () => {
    expect(stakeDeficit(420n, 200n)).toBe(220n);
    expect(stakeDeficit(420n, 420n)).toBe(0n);
  });
});
