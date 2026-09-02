import { useEffect, useRef, useState } from 'react';
import { WalletList } from '@starknet-io/get-starknet-modal';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { shareableGameViewSearch } from '../../utils/gameViewSearch';

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
  const shareableSearch = shareableGameViewSearch(
    new URLSearchParams(location.search)
  ).toString();

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
    : isConnected
      ? '> OPERATOR'
      : '> CONNECT_WALLET';

  const handleButtonClick = () => {
    setIsOpen((open) => !open);
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setIsOpen(false);
    } catch {
      // The actionable error is exposed through WalletContext.
    }
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
        onClick={handleButtonClick}
        disabled={isConnecting}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={
          error ||
          (isConnected
            ? `Open ${walletName || 'wallet'} Operator menu`
            : 'Connect a Starknet wallet')
        }
        className="border border-fg px-2 py-2 text-[10px] tracking-wider text-fg transition-colors hover:bg-fg hover:text-bg disabled:cursor-wait disabled:opacity-50 sm:px-4 sm:text-sm"
      >
        {label}
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 border border-grid bg-bg p-2 shadow-2xl"
        >
          {isConnected && address ? (
            <>
              <div className="border-b border-grid px-3 pb-3 pt-1">
                <div className="flex items-center gap-2 text-[9px] tracking-[0.18em] text-neutral-400">
                  <span className="h-1.5 w-1.5 bg-white" />
                  {walletName || 'WALLET'} CONNECTED
                </div>
                <div className="mt-2 text-[9px] tabular-nums text-neutral-600">
                  {shortAddress(address)}
                </div>
              </div>

              <div className="flex flex-col gap-1 pt-2">
                <Link
                  role="menuitem"
                  to={{
                    pathname: '/operator',
                    search: shareableSearch ? `?${shareableSearch}` : '',
                  }}
                  data-preserve-core-tracking
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center justify-between border border-transparent px-3 py-2.5 text-left text-[10px] tracking-[0.16em] text-fg transition-colors hover:border-fg hover:bg-fg hover:text-bg focus-visible:border-fg focus-visible:outline-none"
                >
                  <span>OPERATOR</span>
                  <span aria-hidden="true">↗</span>
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleDisconnect()}
                  className="flex w-full items-center justify-between border border-transparent px-3 py-2.5 text-left text-[10px] tracking-[0.16em] text-neutral-500 transition-colors hover:border-amber-500/60 hover:text-amber-400 focus-visible:border-amber-500 focus-visible:outline-none"
                >
                  <span>DISCONNECT</span>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
