import type { PropsWithChildren } from 'react';
import { jsonRpcProvider } from '@starknetfoundation/starknet-start-providers';
import { StarknetConfig } from '@starknetfoundation/starknet-start-react';
import { bramble, outis } from '@starknet-io/get-starknet-wallets';
import { config } from '../services/config';
import { stakeWarsChain } from './chain';

const provider = jsonRpcProvider({
  rpc: (chain) =>
    chain.id === stakeWarsChain.id ? { nodeUrl: config.starknetRpcUrl } : null,
});

// These show an install link in the wallet list when they are missing.
const recommendedWallets = [outis, bramble];

export function StakeWarsStarknetProvider({ children }: PropsWithChildren) {
  return (
    <StarknetConfig
      chains={[stakeWarsChain]}
      defaultChainId={stakeWarsChain.id}
      provider={provider}
      recommendedWallets={recommendedWallets}
    >
      {children}
    </StarknetConfig>
  );
}
