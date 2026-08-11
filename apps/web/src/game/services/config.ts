export const config = {
  domain: import.meta.env.VITE_API_DOMAIN || 'https://api.stakewars.gg',
  starknetRpcUrl: import.meta.env.VITE_STARKNET_RPC_URL || '',
  starknetChainId: import.meta.env.VITE_STARKNET_CHAIN_ID || '',
  dojoWorldAddress: import.meta.env.VITE_DOJO_WORLD_ADDRESS || '',
  opensea: 'https://opensea.io/assets/',
} as const;
