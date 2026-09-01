export const PROJECTION_SEARCH_PARAM = 'projection';

export function isProjectionModeEnabled(search: URLSearchParams): boolean {
  return search.get(PROJECTION_SEARCH_PARAM) === '1';
}

export function setProjectionMode(
  search: URLSearchParams,
  visible: boolean
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (visible) {
    next.set(PROJECTION_SEARCH_PARAM, '1');
  } else {
    next.delete(PROJECTION_SEARCH_PARAM);
  }
  return next;
}

export function shareableGameViewSearch(
  search: URLSearchParams
): URLSearchParams {
  const next = new URLSearchParams();
  if (search.get('tracking') === 'beacon') {
    next.set('tracking', 'beacon');
  }
  if (isProjectionModeEnabled(search)) {
    next.set(PROJECTION_SEARCH_PARAM, '1');
  }
  return next;
}
