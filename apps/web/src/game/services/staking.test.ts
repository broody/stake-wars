import { describe, expect, it } from 'vitest';
import {
  buildStakeCalls,
  buildSwitchDelegationCalls,
  buildUnstakeAllCalls,
  buildWithdrawUnstakedCall,
} from './staking';

describe('staking entry calls', () => {
  it('approves STRK and enters the pool for a new member', () => {
    expect(
      buildStakeCalls({
        stakingPoolAddress: '0xpool',
        strkTokenAddress: '0xstrk',
        operatorAddress: '0xoperator',
        amount: 700n,
        isPoolMember: false,
      })
    ).toEqual([
      {
        contractAddress: '0xstrk',
        entrypoint: 'approve',
        calldata: ['0xpool', '700', '0'],
      },
      {
        contractAddress: '0xpool',
        entrypoint: 'enter_delegation_pool',
        calldata: ['0xoperator', '700'],
      },
    ]);
  });

  it('adds stake for an existing pool member', () => {
    expect(
      buildStakeCalls({
        stakingPoolAddress: '0xpool',
        strkTokenAddress: '0xstrk',
        operatorAddress: '0xoperator',
        amount: 1n << 128n,
        isPoolMember: true,
      })
    ).toEqual([
      {
        contractAddress: '0xstrk',
        entrypoint: 'approve',
        calldata: ['0xpool', '0', '1'],
      },
      {
        contractAddress: '0xpool',
        entrypoint: 'add_to_delegation_pool',
        calldata: ['0xoperator', (1n << 128n).toString()],
      },
    ]);
  });
});

describe('staking exit calls', () => {
  it('permanently retires the address before starting the official exit', () => {
    expect(
      buildUnstakeAllCalls({
        controlSystemAddress: '0xcontrol',
        stakingPoolAddress: '0xpool',
        amount: 700n,
      })
    ).toEqual([
      {
        contractAddress: '0xcontrol',
        entrypoint: 'retire',
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

describe('delegation switch calls', () => {
  it('moves a source position to the Stake Wars pool in one account transaction', () => {
    expect(
      buildSwitchDelegationCalls({
        sourcePoolAddress: '0xsource',
        targetStakerAddress: '0xstakewars',
        targetPoolAddress: '0xtarget',
        amount: 900n,
      })
    ).toEqual([
      {
        contractAddress: '0xsource',
        entrypoint: 'exit_delegation_pool_intent',
        calldata: ['900'],
      },
      {
        contractAddress: '0xsource',
        entrypoint: 'switch_delegation_pool',
        calldata: ['0xstakewars', '0xtarget', '900'],
      },
    ]);
  });

  it('rejects empty switch positions', () => {
    expect(() =>
      buildSwitchDelegationCalls({
        sourcePoolAddress: '0xsource',
        targetStakerAddress: '0xstakewars',
        targetPoolAddress: '0xtarget',
        amount: 0n,
      })
    ).toThrow('delegation switch amount must be positive');
  });
});
