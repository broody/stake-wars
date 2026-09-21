export function isReadyWallet(name: string, id?: string | null) {
  return id === 'argentX' || /ready|argent/i.test(name);
}

export function isBraavosWallet(name: string, id?: string | null) {
  return id === 'braavos' || /braavos/i.test(name);
}

export function isSupportedWallet(name: string, id?: string | null) {
  return isReadyWallet(name, id) || isBraavosWallet(name, id);
}
