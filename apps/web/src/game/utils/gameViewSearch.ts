export function shareableGameViewSearch(
  search: URLSearchParams
): URLSearchParams {
  const next = new URLSearchParams();
  if (search.get('tracking') === 'beacon') {
    next.set('tracking', 'beacon');
  }
  return next;
}
