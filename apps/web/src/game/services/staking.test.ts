import { describe, expect, it } from 'vitest';
import { buildUnstakeAllCalls, buildWithdrawUnstakedCall } from './staking';

describe('staking exit calls', () => {
  it('relinquishes the game generation before starting the official exit', () => {
    expect(
      buildUnstakeAllCalls({
        controlSystemAddress: '0xcontrol',
        stakingPoolAddress: '0xpool',
        amount: 700n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'relinquish_all',
        calldata: [],
      },
      {
        contractAddress: '0xpool',
        entrypoint: 'exit_delegation_pool_intent',
        calldata: ['700'],
      },
    ]);
  });

  it('builds the official withdrawal completion call', () => {
    expect(buildWithdrawUnstakedCall('0xpool', '0xoperator')).toEqual({
      contractAddress: '0xpool',
      entrypoint: 'exit_delegation_pool_action',
      calldata: ['0xoperator'],
    });
  });
});
