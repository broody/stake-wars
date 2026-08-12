interface ActivityButtonProps {
  onClick: () => void;
}

export function ActivityButton({ onClick }: ActivityButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-fg px-2 py-2 text-[10px] tracking-wider text-fg transition-colors hover:bg-fg hover:text-bg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-4 sm:text-sm"
      aria-label="Open operator activity"
    >
      ACTIVITY
    </button>
  );
}
