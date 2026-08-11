export const config = {
  domain: import.meta.env.VITE_API_DOMAIN || 'https://api.stakewars.gg',
  starknetRpcUrl:
    import.meta.env.VITE_STARKNET_RPC_URL ||
    (import.meta.env.DEV
      ? 'http://127.0.0.1:5050'
      : 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9'),
  starknetChainId:
    import.meta.env.VITE_STARKNET_CHAIN_ID ||
    (import.meta.env.DEV ? 'KATANA' : 'SN_MAIN'),
  dojoWorldAddress: import.meta.env.VITE_DOJO_WORLD_ADDRESS || '',
  controlSystemAddress: import.meta.env.VITE_CONTROL_SYSTEM_ADDRESS || '',
  strkTokenAddress: import.meta.env.VITE_STRK_TOKEN_ADDRESS || '',
  stakingPoolAddress: import.meta.env.VITE_STAKING_POOL_ADDRESS || '',
} as const;
