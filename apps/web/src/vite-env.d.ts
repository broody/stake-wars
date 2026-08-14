/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_DOMAIN?: string;
  readonly VITE_STARKNET_RPC_URL?: string;
  readonly VITE_STARKNET_CHAIN_ID?: string;
  readonly VITE_DOJO_WORLD_ADDRESS?: string;
  readonly VITE_CONTROL_SYSTEM_ADDRESS?: string;
  readonly VITE_STRK_TOKEN_ADDRESS?: string;
  readonly VITE_STAKING_POOL_ADDRESS?: string;
  readonly VITE_TORII_GRAPHQL_URL?: string;
  readonly VITE_KEYCHAIN_FRAME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
