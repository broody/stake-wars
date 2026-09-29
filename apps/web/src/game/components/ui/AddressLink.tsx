import type { ReactNode } from 'react';
import { shortAddress } from '../../utils/format';
import { voyagerContractUrl } from '../../utils/voyager';

/** An account or contract address that opens on Voyager in a new tab. */
export function AddressLink({
  address,
  children,
  className = '',
}: {
  address: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={voyagerContractUrl(address)}
      target="_blank"
      rel="noreferrer"
      title={`${address} · View on Voyager`}
      className={`underline decoration-neutral-600 decoration-dotted underline-offset-2 transition-colors hover:text-white hover:decoration-white hover:decoration-solid focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white ${className}`}
    >
      {children ?? shortAddress(address)}
      <span aria-hidden="true" className="ml-1 opacity-60">
        ↗
      </span>
    </a>
  );
}
