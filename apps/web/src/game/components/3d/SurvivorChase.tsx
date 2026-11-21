import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import chasePoster from './survivor-chase.webp';

const ChaseScene = lazy(() => import('./SurvivorChaseScene'));

// The poster stays visible if a model fails to load or WebGL is unavailable.
class ChaseBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SurvivorChase() {
  const host = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (
      !host.current ||
      !window.WebGL2RenderingContext ||
      !window.IntersectionObserver
    )
      return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    function sync() {
      const animate = inView && !document.hidden && !motion.matches;
      setActive(animate);
      if (animate || motion.matches) setStarted(animate);
    }
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(host.current);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className="pointer-events-none relative h-52 w-full overflow-hidden md:absolute md:inset-y-0 md:right-0 md:h-full md:w-7/12"
    >
      <img
        src={chasePoster}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      {started && (
        <ChaseBoundary>
          <Suspense fallback={null}>
            <ChaseScene active={active} />
          </Suspense>
        </ChaseBoundary>
      )}
    </div>
  );
}
