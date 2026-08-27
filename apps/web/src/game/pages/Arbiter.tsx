import { Link, useLocation } from 'react-router-dom';
import { ArbiterLogo } from '../components/3d/ArbiterLogo';
import { ArbiterConsole } from '../components/ui/ArbiterModal';
import { useArbiterPreview } from '../contexts/useArbiterPreview';
import { createArbiterMockHistory } from '../services/arbiterMock';

export function Arbiter() {
  const location = useLocation();
  const {
    snapshot,
    isLoading,
    error,
    refresh,
    previewMode,
    onPreviewModeChange,
  } = useArbiterPreview();
  const view = location.pathname.endsWith('/history') ? 'history' : 'auction';
  const mockMode =
    previewMode && previewMode !== 'live' ? previewMode : undefined;
  const history = mockMode ? createArbiterMockHistory(mockMode) : [];
  const mockBid = mockMode ? () => undefined : undefined;

  return (
    <div className="h-full w-full overflow-y-auto bg-bg font-mono">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.055),transparent_24%)]" />
      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-20 sm:px-6 sm:pt-24">
        <header className="relative border-b border-grid pb-5 pr-24 sm:pb-6 sm:pr-36">
          <div className="text-[9px] tracking-[0.26em] text-dim">
            SEALED CONTROL AUCTION
          </div>
          <h1 className="mt-1 text-4xl font-bold tracking-[-0.08em] text-fg sm:text-5xl">
            ARBITER
          </h1>
          <p className="mt-2 max-w-xl text-[11px] leading-5 text-neutral-400">
            Bid to influence the Arbiter. All bids are private until auction
            round ends.
          </p>

          <div className="absolute right-0 top-0 flex items-center gap-3">
            <div className="hidden text-right text-[7px] tracking-[0.18em] text-neutral-600 sm:block">
              <div>LIVE OBJECT</div>
              <div className="mt-1 text-neutral-400">ARBITER // 01</div>
            </div>
            <div className="h-16 w-16 border border-grid bg-black sm:h-24 sm:w-24">
              <ArbiterLogo className="pointer-events-none h-full w-full" />
            </div>
          </div>
        </header>

        <nav
          aria-label="Arbiter pages"
          className="mb-5 flex border-b border-grid sm:mb-6"
        >
          <ArbiterPageLink
            to="/arbiter"
            search={location.search}
            active={view === 'auction'}
          >
            AUCTION
          </ArbiterPageLink>
          <ArbiterPageLink
            to="/arbiter/history"
            search={location.search}
            active={view === 'history'}
          >
            HISTORY
          </ArbiterPageLink>
        </nav>

        <ArbiterConsole
          isOpen
          onClose={() => undefined}
          snapshot={snapshot}
          isLoading={isLoading}
          error={error}
          onRefresh={refresh}
          onPlaceBid={mockBid}
          previewMode={previewMode}
          onPreviewModeChange={onPreviewModeChange}
          presentation="page"
          title={view === 'history' ? 'WINNER HISTORY' : 'CONTROL AUCTION'}
          view={view}
          history={history}
        />
      </div>
    </div>
  );
}

function ArbiterPageLink({
  to,
  search,
  active,
  children,
}: {
  to: string;
  search: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      to={{ pathname: to, search }}
      aria-current={active ? 'page' : undefined}
      className={`min-w-28 border-x border-grid px-5 py-3 text-center text-[9px] tracking-[0.2em] transition-colors first:border-r-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-fg ${
        active ? 'bg-fg text-bg' : 'text-neutral-500 hover:text-fg'
      }`}
    >
      {children}
    </Link>
  );
}
