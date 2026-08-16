// Minimal in-memory implementation of the window.storage contract (get/set/delete/list) that
// Store's readDoc/writeDoc call. Good enough to exercise real persistence round-trips in Node.
function makeMemoryStorage() {
  const personal = new Map();
  const shared = new Map();
  const store = (isShared) => (isShared ? shared : personal);
  return {
    async get(key, isShared) {
      const m = store(isShared);
      if (!m.has(key)) throw new Error('not found');
      return { key, value: m.get(key), shared: !!isShared };
    },
    async set(key, value, isShared) {
      store(isShared).set(key, value);
      return { key, value, shared: !!isShared };
    },
    async delete(key, isShared) {
      const m = store(isShared);
      const existed = m.has(key);
      m.delete(key);
      return { key, deleted: existed, shared: !!isShared };
    },
    async list(prefix, isShared) {
      const m = store(isShared);
      const keys = [...m.keys()].filter(k => !prefix || k.startsWith(prefix));
      return { keys, prefix, shared: !!isShared };
    },
    _dump() { return { personal: Object.fromEntries(personal), shared: Object.fromEntries(shared) }; },
  };
}
module.exports = { makeMemoryStorage };
