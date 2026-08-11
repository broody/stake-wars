import type { PropsWithChildren } from 'react';
import { ControllerToaster } from '@cartridge/controller/react';
import '@cartridge/controller/react/styles.css';
import { jsonRpcProvider } from '@starknet-start/providers';
import { StarknetConfig } from '@starknet-start/react';
import { AutoConnect } from './useAutoConnect';
import { config } from '../services/config';
import { stakeWarsChain } from './controller';

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
      <AutoConnect />
      {children}
      <ControllerToaster position="bottom-right" />
    </StarknetConfig>
  );
}
