import ControllerConnector from '@cartridge/connector/controller';
import type { SessionPolicies } from '@cartridge/presets';
import { mainnet, sepolia, type Chain } from '@starknet-start/chains';
import { num, shortString } from 'starknet';
import { config } from '../services/config';

const LOCAL_STRK_ADDRESS =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

function configuredChain(): Chain {
  if (config.starknetChainId === 'SN_MAIN') {
    return {
      ...mainnet,
      rpcUrls: {
        ...mainnet.rpcUrls,
        default: { http: [config.starknetRpcUrl] },
        public: { http: [config.starknetRpcUrl] },
      },
    };
  }

  if (config.starknetChainId === 'SN_SEPOLIA') {
    return {
      ...sepolia,
      rpcUrls: {
        ...sepolia.rpcUrls,
        default: { http: [config.starknetRpcUrl] },
        public: { http: [config.starknetRpcUrl] },
      },
    };
  }

  const chainId = num.toBigInt(
    shortString.encodeShortString(config.starknetChainId)
  );

  return {
    id: chainId,
    network: config.starknetChainId.toLowerCase(),
    name: config.starknetChainId,
    testnet: true,
    nativeCurrency: {
      address: LOCAL_STRK_ADDRESS,
      name: 'Starknet Token',
      symbol: 'STRK',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [config.starknetRpcUrl] },
      public: { http: [config.starknetRpcUrl] },
    },
    paymasterRpcUrls: {
      default: { http: [config.starknetRpcUrl] },
      avnu: { http: [config.starknetRpcUrl] },
    },
  };
}

export const stakeWarsChain = configuredChain();

const policies: SessionPolicies = {
  // Token approvals and validator staking intentionally stay outside the
  // session policy. Controller will request explicit approval for financial
  // calls while preserving one atomic transaction.
  contracts: config.controlSystemAddress
    ? {
        [config.controlSystemAddress]: {
          methods: [
            {
              name: 'Capture Control Point',
              entrypoint: 'capture',
              description:
                'Allocate selected delegated power to a neutral Control Point.',
            },
            {
              name: 'Reinforce Control Point',
              entrypoint: 'reinforce',
              description:
                'Add selected delegated power to an owned Control Point.',
            },
            {
              name: 'Challenge Control Point',
              entrypoint: 'challenge',
              description: 'Commit selected delegated power to a challenge.',
            },
            {
              name: 'Challenge with Collateral',
              entrypoint: 'challenge_with_collateral',
              description:
                'Sacrifice an owned Control Point and selected available power into a challenge.',
            },
            {
              name: 'Settle Challenge',
              entrypoint: 'settle_challenge',
              description: 'Settle a challenge after its deadline.',
            },
            {
              name: 'Release Control Point',
              entrypoint: 'release',
              description: 'Release an owned point.',
            },
            {
              name: 'Retire Operator Address',
              entrypoint: 'retire',
              description: 'Permanently retire this address from StakeWars.',
            },
          ],
        },
      }
    : {},
};

export const controllerConnector = new ControllerConnector({
  chains: [
    {
      chainId: num.toHex(stakeWarsChain.id),
      rpcUrl: config.starknetRpcUrl,
    },
  ],
  defaultChainId: num.toHex(stakeWarsChain.id),
  policies,
  lazyload: true,
  tokens: { erc20: ['strk'] },
  url: import.meta.env.VITE_KEYCHAIN_FRAME_URL || undefined,
});
