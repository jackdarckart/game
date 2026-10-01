const listeners = new Map();

export const events = {
  on(name, callback) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    return () => listeners.get(name)?.delete(callback);
  },
  emit(name, payload) {
    for (const callback of listeners.get(name) ?? []) callback(payload);
  }
};
