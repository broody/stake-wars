import { config } from '../services/config';

function voyagerOrigin(): string {
  return config.starknetChainId === 'SN_MAIN'
    ? 'https://voyager.online'
    : 'https://sepolia.voyager.online';
}

export function voyagerTransactionUrl(hash: string): string {
  return `${voyagerOrigin()}/tx/${hash}`;
}

export function voyagerContractUrl(address: string): string {
  return `${voyagerOrigin()}/contract/${address}`;
}

export function voyagerValidatorUrl(stakerAddress: string): string {
  return `${voyagerOrigin()}/staking?validator=${stakerAddress}`;
}
