let appReady = false;
const listeners = new Set();

export function signalAppReady() {
  if (appReady) return;
  appReady = true;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
  listeners.clear();
}

export function isAppReady() {
  return appReady;
}

export function subscribeAppReady(fn) {
  if (appReady) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
