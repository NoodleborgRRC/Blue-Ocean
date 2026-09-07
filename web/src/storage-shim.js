// The artifact platform provides window.storage. A plain browser does not, so the web build has
// to supply the same contract over localStorage before the game's first read.
//
// Contract, matching what blueocean-core.jsx expects:
//   get(key, shared)    -> { key, value, shared } | null
//   set(key, value, shared) -> { key, value, shared }
//   delete(key, shared) -> { key, deleted, shared }
//   list(prefix, shared) -> { keys, prefix, shared }
//
// The core wraps every call in try/catch and treats null as "absent", so returning null for a
// missing key is safe and avoids throwing on ordinary first-run reads.
//
// `shared` is namespaced but NOT actually shared between visitors — there is no backend here.
// A leaderboard written to shared storage would be local to each player's browser.

const NS = 'blueocean';
const nsKey = (key, shared) => `${NS}:${shared ? 's' : 'u'}:${key}`;

function available() {
  try {
    const probe = `${NS}:__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (e) {
    return false; // private browsing, disabled storage, quota of zero
  }
}

// Memory fallback so the game is still PLAYABLE with storage blocked — the run just won't
// survive a refresh. Losing saves is bad; refusing to boot is worse.
const memory = new Map();

export function installStorageShim() {
  if (typeof window === 'undefined') return;
  if (window.storage) return; // real platform storage wins

  const useLocal = available();
  const backend = useLocal
    ? {
        get: (k) => window.localStorage.getItem(k),
        set: (k, v) => window.localStorage.setItem(k, v),
        del: (k) => window.localStorage.removeItem(k),
        keys: () => Object.keys(window.localStorage),
      }
    : {
        get: (k) => (memory.has(k) ? memory.get(k) : null),
        set: (k, v) => memory.set(k, v),
        del: (k) => memory.delete(k),
        keys: () => Array.from(memory.keys()),
      };

  window.storage = {
    async get(key, shared = false) {
      const value = backend.get(nsKey(key, shared));
      return value == null ? null : { key, value, shared };
    },
    async set(key, value, shared = false) {
      backend.set(nsKey(key, shared), String(value));
      return { key, value, shared };
    },
    async delete(key, shared = false) {
      backend.del(nsKey(key, shared));
      return { key, deleted: true, shared };
    },
    async list(prefix = '', shared = false) {
      const full = nsKey(prefix, shared);
      const keys = backend.keys()
        .filter((k) => k.startsWith(full))
        .map((k) => k.slice(`${NS}:${shared ? 's' : 'u'}:`.length));
      return { keys, prefix, shared };
    },
  };

  if (!useLocal) {
    console.warn('[Blue Ocean] Browser storage unavailable — progress will not survive a refresh.');
  }
}
