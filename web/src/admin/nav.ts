/** Navigation innerhalb von /admin ohne Router-Bibliothek. */
export function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
