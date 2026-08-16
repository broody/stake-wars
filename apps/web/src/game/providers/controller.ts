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
              name: 'Place Open Bid',
              entrypoint: 'bid',
              description:
                'Place a visible STRK-backed bid on a contested Control Point.',
            },
            {
              name: 'Sacrifice Control Point and Bid',
              entrypoint: 'bid_with_sacrifice',
              description:
                'Release an owned Control Point and use the freed garrison in an open bid.',
            },
            {
              name: 'Settle Open Contest',
              entrypoint: 'settle_challenge',
              description:
                'Finalize a contest after its response window expires.',
            },
            {
              name: 'Resolve Challenge Position',
              entrypoint: 'resolve_challenge_position',
              description:
                'Finalize a losing bid position after its contest settles.',
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
