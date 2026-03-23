// ─── SettingsManager ──────────────────────────────────────────────────────────
//
// Manages settings state, persistence, and applying CSS class toggles to the
// DOM. Shared by Freecell and Spider.
//
// Each game passes its own StorageManager and defaults, keeping storage keys
// and setting fields game-specific. Games can also pass an onApply callback
// for any extra logic needed after settings change (e.g. redrawing the board).
//
// Usage:
//   const storage  = new StorageManager('freecell-settings');
//   const settings = new SettingsManager(storage, {
//       darkMode: false, showScore: true, showMoves: true,
//       showTime: true, showNumberBar: true,
//   }, {
//       // CSS class toggles: key = setting name, value = CSS class to toggle
//       darkMode:      'dark-mode',
//       showScore:     'hide-score',      // note: inverted below where needed
//       showNumberBar: 'hide-number-bar',
//   }, () => {
//       // optional: called after every applySettings()
//       game.updateSequenceOutlines();
//   });
//
//   settings.get('darkMode');         // false
//   settings.set('darkMode', true);   // saves and re-applies
//   settings.toggle('darkMode');      // flips, saves, re-applies
//   settings.apply();                 // re-applies all CSS classes to DOM
// ─────────────────────────────────────────────────────────────────────────────

class SettingsManager {
    // storage:    a StorageManager instance
    // defaults:   plain object of all settings and their default values
    // classMap:   maps setting keys to CSS class names.
    //             For "show" settings the class is applied when the value is FALSE
    //             (e.g. showScore: false → add 'hide-score').
    //             For other settings the class is applied when the value is TRUE
    //             (e.g. darkMode: true → add 'dark-mode').
    //             Convention: if the CSS class starts with 'hide-', it's treated
    //             as inverted automatically.
    // onApply:    optional callback fired after every apply() — use for any
    //             game-specific side effects (e.g. redrawing sequence outlines)
    constructor(storage, defaults, classMap = {}, onApply = null) {
        this.storage  = storage;
        this.defaults = defaults;
        this.classMap = classMap;
        this.onApply  = onApply;
        this.data     = this.storage.load(defaults);
    }

    // Returns the value of a single setting.
    get(key) {
        return this.data[key];
    }

    // Returns a copy of all settings.
    getAll() {
        return { ...this.data };
    }

    // Sets a single setting, saves, and re-applies CSS classes.
    set(key, value) {
        this.data[key] = value;
        this.storage.save(this.data);
        this.apply();
    }

    // Flips a boolean setting, saves, and re-applies CSS classes.
    toggle(key) {
        this.set(key, !this.data[key]);
    }

    // Applies all CSS class toggles to document.body based on current settings.
    // Called automatically by set() and toggle(). Also call manually on page load.
    apply() {
        for (const [key, cssClass] of Object.entries(this.classMap)) {
            const value    = this.data[key];
            // 'hide-*' classes are inverted: added when the setting is false
            const inverted = cssClass.startsWith('hide-');
            const active   = inverted ? !value : value;
            document.body.classList.toggle(cssClass, active);
        }
        if (this.onApply) this.onApply();
    }
}
