import { useEffect, useRef, useState } from 'react';
import { WalletList } from '@starknet-io/get-starknet-modal';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../../contexts/WalletContext';
import { shareableGameViewSearch } from '../../utils/gameViewSearch';
import { isSupportedWallet } from '../../utils/wallets';
import { Button, Eyebrow, ExternalLink, Panel } from '../../../ui';
import { AddressLink } from './AddressLink';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

interface WalletButtonProps {
  /** `block` renders a full-width primary button with the menu in flow. */
  variant?: 'nav' | 'block';
  label?: string;
}

export function WalletButton({
  variant = 'nav',
  label: disconnectedLabel,
}: WalletButtonProps = {}) {
  const isBlock = variant === 'block';
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

  // The block menu opens in flow, often inside a scrolling panel.
  useEffect(() => {
    if (!isOpen || !isBlock) return;
    menuRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isBlock, isOpen]);

  // The spinner stands in for the prompt while connecting.
  const label = isConnecting
    ? 'CONNECTING'
    : isConnected
      ? '> OPERATOR'
      : (disconnectedLabel ?? '> CONNECT_WALLET');

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
    <div ref={menuRef} className={isBlock ? 'w-full' : 'relative'}>
      <Button
        variant={isBlock ? 'solid' : 'outline'}
        fullWidth={isBlock}
        onClick={handleButtonClick}
        busy={isConnecting}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={
          error ||
          (isConnected
            ? `Open ${walletName || 'wallet'} Operator menu`
            : 'Connect a Starknet wallet')
        }
        className={
          isBlock
            ? undefined
            : 'whitespace-nowrap border-fg px-2 text-tag text-fg sm:px-4 sm:text-body'
        }
      >
        {label}
      </Button>

      {isOpen ? (
        <Panel
          as="div"
          role="menu"
          tone={isBlock ? 'default' : 'floating'}
          className={
            isBlock
              ? 'mt-2 w-full p-2'
              : 'absolute right-0 top-full z-50 mt-2 w-64 p-2'
          }
        >
          {isConnected && address ? (
            <>
              <div className="border-b border-line px-3 pb-3 pt-1">
                <Eyebrow dot>{walletName || 'WALLET'} CONNECTED</Eyebrow>
                <div className="mt-2 text-label tabular-nums text-fg-subtle">
                  <AddressLink address={address}>
                    {shortAddress(address)}
                  </AddressLink>
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
                  className="flex w-full items-center justify-between border border-transparent px-3 py-2.5 text-left text-label text-fg transition-colors hover:border-fg hover:bg-fg hover:text-surface"
                >
                  <span>OPERATOR</span>
                  <span aria-hidden="true">↗</span>
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleDisconnect()}
                  className="flex w-full items-center justify-between border border-transparent px-3 py-2.5 text-left text-label text-fg-subtle transition-colors hover:border-warning-strong/60 hover:text-warning"
                >
                  <span>DISCONNECT</span>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <Eyebrow className="px-2 pb-2">SELECT WALLET</Eyebrow>
              <WalletList className="flex flex-col gap-1">
                {(option) => {
                  const id = option.info?.id;
                  if (!isSupportedWallet(option.name, id)) {
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
                        className="flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left text-body text-fg transition-colors hover:border-fg hover:bg-fg hover:text-surface"
                      >
                        <img src={icon} alt="" className="h-6 w-6" />
                        <span>{option.name}</span>
                        <span className="ml-auto text-label opacity-60">
                          CONNECT
                        </span>
                      </button>
                    );
                  }

                  const downloadUrl = preferredDownload(option.info.downloads);
                  return (
                    <ExternalLink
                      key={option.name}
                      role="menuitem"
                      href={downloadUrl}
                      quiet
                      className="flex w-full items-center gap-3 border border-transparent px-3 py-2 text-left text-body text-fg-subtle hover:border-fg"
                    >
                      <img src={icon} alt="" className="h-6 w-6" />
                      <span>{option.name}</span>
                      <span className="ml-auto text-label">INSTALL</span>
                    </ExternalLink>
                  );
                }}
              </WalletList>
            </>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
