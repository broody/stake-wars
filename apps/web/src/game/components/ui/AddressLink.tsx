import type { ReactNode } from 'react';
import { ExternalLink } from '../../../ui';
import { shortAddress } from '../../utils/format';
import { voyagerContractUrl } from '../../utils/voyager';

/** An account or contract address that opens on Voyager in a new tab. */
export function AddressLink({
  address,
  children,
  className,
}: {
  address: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <ExternalLink
      href={voyagerContractUrl(address)}
      title={`${address} · View on Voyager`}
      className={className}
    >
      {children ?? shortAddress(address)}
    </ExternalLink>
  );
}
