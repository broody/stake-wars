import { braavos, readyWallet } from '@starknet-io/get-starknet-wallets';

export function isReadyWallet(name: string, id?: string | null) {
  return id === 'argentX' || /ready|argent/i.test(name);
}

export function isBraavosWallet(name: string, id?: string | null) {
  return id === 'braavos' || /braavos/i.test(name);
}

export function isXverseWallet(name: string, id?: string | null) {
  return id === 'xverse' || /xverse/i.test(name);
}

export function isOutisWallet(name: string, id?: string | null) {
  return id === 'outis' || /outis/i.test(name);
}

export function isSupportedWallet(name: string, id?: string | null) {
  return (
    isReadyWallet(name, id) ||
    isBraavosWallet(name, id) ||
    isXverseWallet(name, id) ||
    isOutisWallet(name, id)
  );
}

// The wallets a Survivor score can record, keyed by the ID the API sends.
const marks: Record<string, { name: string; icon?: string }> = {
  outis: { name: 'Outis', icon: '/outis-mark.svg' },
  argentX: { name: 'Ready', icon: readyWallet.icon },
  braavos: { name: 'Braavos', icon: braavos.icon },
  xverse: { name: 'Xverse' },
};

export function walletMark(id?: string | null) {
  return id ? marks[id] : undefined;
}

/** Names a connected wallet, preferring its short brand name. */
export function walletLabel(id?: string | null, name?: string | null) {
  return walletMark(id)?.name || name || 'Wallet';
}
