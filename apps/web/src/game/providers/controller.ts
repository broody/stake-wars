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
              description: 'Capture a neutral or contested Control Point.',
            },
            {
              name: 'Capture Control Points',
              entrypoint: 'capture_many',
              description:
                'Capture multiple neutral or contested Control Points.',
            },
            {
              name: 'Reinforce Control Point',
              entrypoint: 'reinforce',
              description: 'Add staked STRK to an owned point.',
            },
            {
              name: 'Reinforce Control Points',
              entrypoint: 'reinforce_many',
              description: 'Add staked STRK to multiple owned points.',
            },
            {
              name: 'Release Control Point',
              entrypoint: 'release',
              description: 'Release an owned point.',
            },
            {
              name: 'Redeploy Control Point',
              entrypoint: 'redeploy',
              description: 'Move allocated stake between Control Points.',
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
