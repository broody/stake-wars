import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const diagnostic =
        this.state.error?.message || 'Unexpected client runtime failure';

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="relative isolate flex min-h-[100svh] w-full flex-col overflow-hidden bg-bg font-mono text-fg"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-20 opacity-70"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_72%_48%,rgba(255,255,255,0.07),transparent_31%)]"
          />

          <header className="flex h-16 shrink-0 items-center justify-between border-b border-grid px-4 sm:px-8">
            <span className="text-sm font-bold tracking-wider sm:text-base">
              STAKE<span className="text-dim">//</span>WARS
            </span>
            <div className="flex items-center gap-2 text-[8px] tracking-[0.2em] text-neutral-500 sm:text-[10px]">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 animate-pulse bg-alert motion-reduce:animate-none"
              />
              SYSTEM STATUS&nbsp; // &nbsp;INTERRUPTED
            </div>
          </header>

          <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(23rem,0.8fr)] lg:gap-20 lg:py-12">
            <section className="max-w-2xl">
              <div className="mb-6 flex items-center gap-3 text-[10px] tracking-[0.26em] text-alert">
                <span aria-hidden="true" className="h-px w-8 bg-alert" />
                RUNTIME FAULT // CORE-00
              </div>

              <h1 className="font-main text-[clamp(3.25rem,8vw,7rem)] font-black uppercase leading-[0.82] tracking-[-0.055em]">
                Core signal
                <span className="block text-neutral-500">lost.</span>
              </h1>

              <p className="mt-8 max-w-lg text-sm leading-7 text-neutral-400 sm:text-base">
                The battle map stopped responding before the sector view could
                finish loading. Reinitialize the Core to reconnect.
              </p>

              <div className="mt-8 max-w-xl border-l border-neutral-700 pl-4">
                <div className="mb-1 text-[8px] tracking-[0.22em] text-neutral-600">
                  DIAGNOSTIC
                </div>
                <code className="block break-words text-[10px] leading-relaxed text-neutral-500 sm:text-xs">
                  {diagnostic}
                </code>
              </div>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-10 border border-white bg-white px-6 py-3.5 text-[10px] font-bold tracking-[0.2em] text-black transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-xs"
              >
                [ REINITIALIZE CORE ]
              </button>
            </section>

            <div
              aria-hidden="true"
              className="relative mx-auto hidden aspect-square w-full max-w-[27rem] items-center justify-center lg:flex"
            >
              <div className="absolute inset-[4%] rotate-12 rounded-full border border-neutral-800" />
              <div className="absolute inset-[15%] -rotate-12 rounded-full border border-dashed border-neutral-700" />
              <div className="absolute inset-[28%] rounded-full border border-neutral-600" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-neutral-700 to-transparent" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-gradient-to-r from-transparent via-neutral-700 to-transparent" />
              <div className="absolute h-2 w-2 bg-alert shadow-[0_0_20px_rgba(201,79,90,0.75)]" />
              <div className="absolute right-[5%] top-[36%] h-1.5 w-1.5 bg-white" />
              <span className="absolute right-0 top-[30%] text-[8px] tracking-[0.16em] text-neutral-600">
                LINK // NULL
              </span>
              <span className="absolute bottom-[8%] left-[11%] text-[8px] tracking-[0.16em] text-neutral-700">
                TARGET LOCK: FAILED
              </span>
            </div>
          </main>

          <footer className="flex shrink-0 items-center justify-between border-t border-grid px-4 py-3 text-[8px] tracking-[0.18em] text-neutral-700 sm:px-8">
            <span>SEPOLIA // STARKNET</span>
            <span>AWAITING OPERATOR INPUT_</span>
          </footer>
        </div>
      );
    }

    return this.props.children;
  }
}
