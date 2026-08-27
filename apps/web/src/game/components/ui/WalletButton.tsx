import { useEffect, useRef, useState } from 'react';
import { WalletList } from '@starknet-io/get-starknet-modal';
import { useLocation } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isReadyWallet(name: string, id?: string) {
  return id === 'argentX' || /ready|argent/i.test(name);
}

function preferredDownload(downloads: Record<string, string>) {
  const agent = window.navigator.userAgent;
  if (/Firefox/i.test(agent) && downloads.firefox) return downloads.firefox;
  if (/Edg/i.test(agent) && downloads.edge) return downloads.edge;
  if (
    /Safari/i.test(agent) &&
    !/Chrome|Chromium/i.test(agent) &&
    downloads.safari
  ) {
    return downloads.safari;
  }
  return downloads.chrome || Object.values(downloads)[0];
}

export function WalletButton() {
  const location = useLocation();
  const {
    address,
    connect,
    disconnect,
    error,
    isConnected,
    isConnecting,
    walletName,
  } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const arbiterPreview = new URLSearchParams(location.search).get(
    'arbiterMock'
  );
  const isMockConnected = Boolean(
    import.meta.env.DEV &&
      location.pathname.startsWith('/arbiter') &&
      arbiterPreview &&
      arbiterPreview !== 'live'
  );
  const hasVisibleConnection = isConnected || isMockConnected;

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const label = isConnecting
    ? '> CONNECTING'
    : isMockConnected
      ? '> 0xB1D...C0DE'
      : isConnected && address
        ? `> ${shortAddress(address)}`
        : '> CONNECT_WALLET';

  const handleButtonClick = async () => {
    if (isMockConnected) return;
    if (isConnected) {
      try {
        await disconnect();
      } catch {
        // The actionable error is exposed through WalletContext.
      }
      return;
    }
    setIsOpen((open) => !open);
  };

  const handleConnect = async (name: string) => {
    try {
      await connect(name);
      setIsOpen(false);
    } catch {
      // The actionable error is exposed through WalletContext.
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => void handleButtonClick()}
        disabled={isConnecting}
        aria-expanded={hasVisibleConnection ? undefined : isOpen}
        aria-haspopup={hasVisibleConnection ? undefined : 'menu'}
        title={
          isMockConnected
            ? 'Mock Ready wallet connected'
            : error ||
              (isConnected
                ? `Disconnect ${walletName || 'wallet'}`
                : 'Connect a Starknet wallet')
        }
        className="border border-fg px-2 py-2 text-[10px] tracking-wider text-fg transition-colors hover:bg-fg hover:text-bg disabled:cursor-wait disabled:opacity-50 sm:px-4 sm:text-sm"
      >
        {label}
      </button>

      {!hasVisibleConnection && isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 border border-grid bg-bg p-2 shadow-2xl"
        >
          <div className="px-2 pb-2 text-[10px] tracking-[0.2em] text-dim">
            SELECT WALLET
          </div>
          <WalletList className="flex flex-col gap-1">
            {(option) => {
              const id = option.info?.id;
              if (!isReadyWallet(option.name, id)) {
                return null;
              }

              const icon =
                option.state === 'available'
                  ? option.wallet.icon
                  : option.info.icon;

              if (option.state === 'available') {
                return (
                  <button
                    key={option.name}
                    type="button"
                    role="menuitem"
                    onClick={() => void handleConnect(option.wallet.name)}
                    className="flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left text-sm text-fg transition-colors hover:border-fg hover:bg-fg hover:text-bg"
                  >
                    <img src={icon} alt="" className="h-6 w-6" />
                    <span>{option.name}</span>
                    <span className="ml-auto text-[10px] tracking-wider opacity-60">
                      CONNECT
                    </span>
                  </button>
                );
              }

              const downloadUrl = preferredDownload(option.info.downloads);
              return (
                <a
                  key={option.name}
                  role="menuitem"
                  href={downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left text-sm text-dim transition-colors hover:border-fg hover:text-fg"
                >
                  <img src={icon} alt="" className="h-6 w-6" />
                  <span>{option.name}</span>
                  <span className="ml-auto text-[10px] tracking-wider">
                    INSTALL
                  </span>
                </a>
              );
            }}
          </WalletList>
        </div>
      ) : null}
    </div>
  );
}
