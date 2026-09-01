const BEACON_DESTINATION_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

export function normalizeBeaconDestination(destinationUrl: string) {
  const trimmed = destinationUrl.trim();
  if (!trimmed || BEACON_DESTINATION_SCHEME.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
