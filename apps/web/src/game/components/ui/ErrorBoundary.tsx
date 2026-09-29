import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Button, Callout } from '../../../ui';

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
          className="relative isolate flex min-h-[100svh] w-full flex-col overflow-hidden bg-surface font-mono text-fg"
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
            className="absolute inset-0 -z-10 bg-glow-white"
          />

          <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4 sm:px-8">
            <span className="text-heading font-bold">
              STAKE<span className="text-fg-disabled">//</span>WARS
            </span>
            <div className="flex items-center gap-2 text-tag text-fg-subtle sm:text-label">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 animate-pulse bg-danger-strong motion-reduce:animate-none"
              />
              SYSTEM STATUS&nbsp; // &nbsp;INTERRUPTED
            </div>
          </header>

          <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(23rem,0.8fr)] lg:gap-20 lg:py-12">
            <section className="max-w-2xl">
              <div className="mb-6 flex items-center gap-3 text-label text-danger-strong">
                <span
                  aria-hidden="true"
                  className="h-px w-8 bg-danger-strong"
                />
                RUNTIME FAULT // CORE-00
              </div>

              <h1 className="font-main text-hero font-black uppercase leading-none">
                Core signal
                <span className="block text-fg-subtle">lost.</span>
              </h1>

              <p className="mt-8 max-w-lg text-body leading-7 text-fg-muted sm:text-lead">
                The battle map stopped responding before the sector view could
                finish loading. Reinitialize the Core to reconnect.
              </p>

              <Callout title="DIAGNOSTIC" className="mt-8 max-w-xl">
                <code className="block break-words leading-relaxed text-fg-subtle">
                  {diagnostic}
                </code>
              </Callout>

              <Button
                variant="solid"
                size="lg"
                onClick={() => window.location.reload()}
                className="mt-10"
              >
                [ REINITIALIZE CORE ]
              </Button>
            </section>

            <div
              aria-hidden="true"
              className="relative mx-auto hidden aspect-square w-full max-w-[27rem] items-center justify-center lg:flex"
            >
              <div className="absolute inset-[4%] rotate-12 rounded-full border border-line" />
              <div className="absolute inset-[15%] -rotate-12 rounded-full border border-dashed border-line-strong" />
              <div className="absolute inset-[28%] rounded-full border border-line-strong" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-line-strong to-transparent" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-gradient-to-r from-transparent via-line-strong to-transparent" />
              <div className="absolute h-2 w-2 bg-danger-strong shadow-glow-danger" />
              <div className="absolute right-[5%] top-[36%] h-1.5 w-1.5 bg-fg" />
              <span className="absolute right-0 top-[30%] text-tag text-fg-subtle">
                LINK // NULL
              </span>
              <span className="absolute bottom-[8%] left-[11%] text-tag text-fg-disabled">
                TARGET LOCK: FAILED
              </span>
            </div>
          </main>

          <footer className="flex shrink-0 items-center justify-between border-t border-line px-4 py-3 text-tag text-fg-subtle sm:px-8">
            <span>SEPOLIA // STARKNET</span>
            <span>AWAITING OPERATOR INPUT_</span>
          </footer>
        </div>
      );
    }

    return this.props.children;
  }
}
