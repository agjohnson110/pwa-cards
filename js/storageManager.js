// ─── StorageManager ───────────────────────────────────────────────────────────
//
// Generic localStorage wrapper used by both Freecell and Spider.
//
// Usage:
//   const storage = new StorageManager('freecell-settings');
//   const settings = storage.load({ darkMode: false, showScore: true });
//   storage.save({ darkMode: true, showScore: true });
//   storage.clear();
// ─────────────────────────────────────────────────────────────────────────────

class StorageManager {
    constructor(key) {
        this.key = key;
    }

    // Load from localStorage, merging with defaults so new keys added
    // in future versions are always present even on older saved data.
    load(defaults) {
        try {
            const saved = localStorage.getItem(this.key);
            return saved ? { ...defaults, ...JSON.parse(saved) } : { ...defaults };
        } catch {
            return { ...defaults };
        }
    }

    // Save any object to localStorage.
    save(data) {
        try {
            localStorage.setItem(this.key, JSON.stringify(data));
        } catch {}
    }

    // Remove this key from localStorage entirely (e.g. reset stats).
    clear() {
        try {
            localStorage.removeItem(this.key);
        } catch {}
    }
}
