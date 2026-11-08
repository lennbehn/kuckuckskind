/** Bildschirm anlassen (Screen Wake Lock API; iOS ab 16.4). */
export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  get supported() {
    return 'wakeLock' in navigator;
  }

  get active() {
    return !!this.sentinel && !this.sentinel.released;
  }

  async request(): Promise<boolean> {
    this.wanted = true;
    if (!this.supported) return false;
    if (this.active) return true;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  /** Nach dem Zurückkommen in den Vordergrund erneut anfordern (der Browser gibt ihn dann frei). */
  async reacquire() {
    if (this.wanted && !this.active) await this.request();
  }
}
