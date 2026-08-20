import type { PropsWithChildren } from 'react';
import { jsonRpcProvider } from '@starknetfoundation/starknet-start-providers';
import { StarknetConfig } from '@starknetfoundation/starknet-start-react';
import { config } from '../services/config';
import { stakeWarsChain } from './chain';

const provider = jsonRpcProvider({
  rpc: (chain) =>
    chain.id === stakeWarsChain.id ? { nodeUrl: config.starknetRpcUrl } : null,
});

export function StakeWarsStarknetProvider({ children }: PropsWithChildren) {
  return (
    <StarknetConfig
      chains={[stakeWarsChain]}
      defaultChainId={stakeWarsChain.id}
      provider={provider}
    >
      {children}
    </StarknetConfig>
  );
}
