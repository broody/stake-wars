/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_DOMAIN?: string;
  readonly VITE_STARKNET_RPC_URL?: string;
  readonly VITE_STARKNET_CHAIN_ID?: string;
  readonly VITE_DOJO_WORLD_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
