export interface AppSelection {
  isGameApp: boolean;
  gameBasename?: string;
}

export function selectApp(hostname: string, pathname: string): AppSelection {
  const isPlayRoute = pathname === '/play' || pathname.startsWith('/play/');
  const isPlayHostname =
    hostname === 'play.stakewars.gg' || hostname.startsWith('play.');

  return {
    isGameApp: isPlayHostname || isPlayRoute || pathname === '/core-lab',
    gameBasename: isPlayRoute ? '/play' : undefined,
  };
}
