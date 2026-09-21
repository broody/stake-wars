import type { PropsWithChildren } from 'react';
import { jsonRpcProvider } from '@starknetfoundation/starknet-start-providers';
import { StarknetConfig } from '@starknetfoundation/starknet-start-react';
import { ControllerConnector } from '@cartridge/connector';
import type { WalletWithStarknetFeatures } from '@starknet-io/get-starknet-wallet-standard/features';
import { constants } from 'starknet';
import { config } from '../services/config';
import { stakeWarsChain } from './chain';

const provider = jsonRpcProvider({
  rpc: (chain) =>
    chain.id === stakeWarsChain.id ? { nodeUrl: config.starknetRpcUrl } : null,
});

const controllerConnector = new ControllerConnector({
  lazyload: true,
  defaultChainId:
    config.starknetChainId === 'SN_MAIN'
      ? constants.StarknetChainId.SN_MAIN
      : constants.StarknetChainId.SN_SEPOLIA,
});
// @cartridge/connector types its wallet-standard adapter against
// get-starknet-core 5; the runtime shape matches the v6 features type.
const controllerWallet =
  controllerConnector.asWalletStandard() as unknown as WalletWithStarknetFeatures;

export function StakeWarsStarknetProvider({ children }: PropsWithChildren) {
  return (
    <StarknetConfig
      chains={[stakeWarsChain]}
      defaultChainId={stakeWarsChain.id}
      provider={provider}
      extraWallets={[controllerWallet]}
    >
      {children}
    </StarknetConfig>
  );
}
