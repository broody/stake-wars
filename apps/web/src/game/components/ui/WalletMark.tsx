import { walletMark } from '../../utils/wallets';

/** Shows the icon and name of the wallet that submitted a score. */
export function WalletMark({ kind }: { kind?: string }) {
  const mark = walletMark(kind);
  if (!mark) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle text-tag text-fg-muted">
      {mark.icon && (
        <img
          src={mark.icon}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0"
        />
      )}
      {mark.name}
    </span>
  );
}
