import { describe, expect, it } from 'vitest';
import {
  formatLandingJackpotPrize,
  parseCurrentLandingJackpot,
  type LandingJackpot,
} from './jackpot';

describe('landing Jackpot data', () => {
  it('selects the newest active or drawing Jackpot', () => {
    expect(
      parseCurrentLandingJackpot({
        data: {
          stakewarsJackpotModels: {
            edges: [
              {
                node: {
                  id: '0x3',
                  status: '0x4',
                  prize_kind: '0x1',
                  token: '0x123',
                  token_id: '0x0',
                  amount: '0x64',
                  ends_at: '0x10',
                  draw_count: '0x1',
                },
              },
              {
                node: {
                  id: '0x2',
                  status: '0x3',
                  prize_kind: '0x1',
                  token: '0x123',
                  token_id: '0x0',
                  amount: '0x3e8',
                  ends_at: '0x20',
                  draw_count: '0x0',
                },
              },
              {
                node: {
                  id: '0x1',
                  status: '0x2',
                  prize_kind: '0x1',
                  token: '0x123',
                  token_id: '0x0',
                  amount: '0x1',
                  ends_at: '0x30',
                  draw_count: '0x0',
                },
              },
            ],
          },
        },
      })?.id
    ).toBe(2n);
  });

  it('returns null when no Jackpot is running', () => {
    expect(
      parseCurrentLandingJackpot({
        data: { stakewarsJackpotModels: { edges: [] } },
      })
    ).toBeNull();
  });

  it('formats STRK and NFT prizes for the live panel', () => {
    const jackpot: LandingJackpot = {
      id: 1n,
      status: 2,
      prizeKind: 1,
      token: '0x0123',
      tokenId: 0n,
      amount: 1000n * 10n ** 18n,
      endsAt: 1,
      drawCount: 0,
    };

    expect(formatLandingJackpotPrize(jackpot, '0x123')).toEqual({
      value: '1,000',
      unit: 'STRK',
    });
    expect(
      formatLandingJackpotPrize(
        { ...jackpot, prizeKind: 2, tokenId: 42n },
        '0x123'
      )
    ).toEqual({ value: '#42', unit: 'ERC-721' });
  });
});
