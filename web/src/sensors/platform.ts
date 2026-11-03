export type Platform = 'ios' | 'android' | 'other';

export function detectPlatform(nav: Navigator = navigator): Platform {
  const ua = nav.userAgent;
  // iPadOS meldet sich als Mac – erkennbar an Touch.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

/** Als PWA vom Home-Bildschirm gestartet (Vollbild auf dem iPhone). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
