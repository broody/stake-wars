import type { PropsWithChildren } from 'react';
import { jsonRpcProvider } from '@starknetfoundation/starknet-start-providers';
import { StarknetConfig } from '@starknetfoundation/starknet-start-react';
import { ControllerConnector } from '@cartridge/connector';
import type { WalletWithStarknetFeatures } from '@starknet-io/get-starknet-wallet-standard/features';
import {
  wallets,
  type WalletInformation,
} from '@starknet-io/get-starknet-wallets';
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

// get-starknet-wallets@6.0.1 has no Xverse entry yet; supply our own so the
// wallet list can render an install option when no Xverse provider is
// injected. The id matches the injected wallet's features id for dedup.
const xverseWallet: WalletInformation = {
  id: 'xverse',
  name: 'Xverse',
  icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACoElEQVR4Ac1XQYvaQBR+iaV6CGFZqCiipLdShVo8eWp7s7cWwet67iX9B7v+A/MHWvcqCD1VocLScy8teOitAaF6WlbtQZe29r3sJJg4k0xcbftBnGRmfN+X9+ZN3iggCcMwjpbL5Qu8faIoSpm61uv1EY3h8xU2Nj5/xvZjKpV6Z9v2lYxdJWpCJpMxkMDE26ZLKIkOXq3pdGrDLgLojVer1SmSvoZbAMW3k8lkS+QRrgB6a2wuSAfsBzZez3jeUIMduVyuvGdyYLYumG0ffB44wJsHYUPAE54HKOYHJndoiINx+QXQgoPDknsiGJcDJwTM9d94syeTiXc/Go2gXq/DfD7nWtaTKnSeH8OD4zte38M3UxDgPoXC9cApSKBUKkGv1wNd16XIw4Dp6aS3yuLRBEnwRMQlZzghbpVtr0J0u91IEa/KGuh3Ffj+45dv3tfLn0K7tKsSt4LxfwsRHrAsCxqNxlY/b018aNyDnJZwyJvvL2F+/TvMdEdlH5ZQmKYp5QkXkuS0Dsq0CA2QgKyIT5NrKXIGg0KwhhiIEw4ZqHEm5/N5qFar3LGwFA0VwIoJKXIioFaEuCKImzxgR02UId9RhK1iPn6BHclpUcbJjiCohEtomkY7oXAzGg6HQnLKjMFgAIVCAYrFom88nU5DpVLhCtyApVIBGbYOeORESuQuRCkaFTLiVlmtdg4x0O/3t/pEIkLQIW7n64GxaJMN3qzxeLzVt1gsuBZJxGw2g1qtJvzvBlr045Vk2Wy2jUJM+AvAkFtYZ9x8jt1OLJ3PQCIl9wCbcd2I2Rz5p0UpgQYSicRLOIwnHNvBs8H/dzAh0ETM0ce0WOCWIBtkS3RGlDqcYnOG1wlIgm1s55TeOx9Og9g4nj9Fgkewp+P5H5G/SMhbm9daAAAAAElFTkSuQmCC',
  downloads: {
    chrome:
      'https://chromewebstore.google.com/detail/xverse-wallet/idnnbdplmphpflfnlkomgpfbpcgelopg',
    ios: 'https://apps.apple.com/us/app/xverse-bitcoin-wallet/id1552272513',
    android:
      'https://play.google.com/store/apps/details?id=com.secretkeylabs.xverse',
  },
};

export function StakeWarsStarknetProvider({ children }: PropsWithChildren) {
  return (
    <StarknetConfig
      chains={[stakeWarsChain]}
      defaultChainId={stakeWarsChain.id}
      provider={provider}
      extraWallets={[controllerWallet]}
      recommendedWallets={[...wallets, xverseWallet]}
    >
      {children}
    </StarknetConfig>
  );
}
