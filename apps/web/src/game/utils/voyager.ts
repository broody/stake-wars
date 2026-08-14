import { config } from '../services/config';

export function voyagerTransactionUrl(hash: string): string {
  const origin =
    config.starknetChainId === 'SN_MAIN'
      ? 'https://voyager.online'
      : 'https://sepolia.voyager.online';
  return `${origin}/tx/${hash}`;
}
