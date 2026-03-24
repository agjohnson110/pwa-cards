// ─── SettingsUI ───────────────────────────────────────────────────────────────
//
// Builds and manages the settings overlay. Shared by Freecell and Spider.
// Game-specific content (toggles, rules, stat fields, action callbacks)
// is passed in via a config object.
//
// Usage:
//   const ui = new SettingsUI({
//       version:      VERSION,
//       settings:     settingsManagerInstance,
//       stats:        statsManagerInstance,
//
//       // Toggle rows shown in the main settings screen
//       // Each entry: { key: 'settingKey', label: 'Display Label' }
//       toggles: [
//           { key: 'showScore',     label: 'Show Score' },
//           { key: 'showMoves',     label: 'Show Moves' },
//           { key: 'darkMode',      label: 'Dark Mode' },
//       ],
//
//       // Stat fields shown in the edit stats screen
//       // Each entry: { key: 'statKey', label: 'Display Label', isTime: bool }
//       statFields: [
//           { key: 'gamesPlayed', label: 'Games Played', isTime: false },
//           { key: 'bestTime',    label: 'Best Time',    isTime: true  },
//       ],
//
//       // Rules HTML string rendered inside the rules screen
//       rulesHTML: `<h3>Objective</h3><p>...</p>`,
//
//       // Callbacks for action buttons
//       onNewGame:  () => game.resetGame(),
//       onRestart:  () => game.restartGame(),
//   });
//
//   ui.open();
//   ui.close();
// ─────────────────────────────────────────────────────────────────────────────

class SettingsUI {
    constructor(config) {
        this.version    = config.version    || '';
        this.settings   = config.settings;   // SettingsManager instance
        this.stats      = config.stats;       // StatsManager instance
        this.toggles    = config.toggles    || [];
        this.statFields = config.statFields || [];
        this.rulesHTML  = config.rulesHTML  || '';
        this.onNewGame  = config.onNewGame  || (() => {});
        this.onRestart  = config.onRestart  || (() => {});
    }

    // ─── Open / Close ─────────────────────────────────────────────────────────

    open() {
        // Remove any existing overlay immediately (bypasses transition)
        // so that calling open() twice never results in two overlays.
        const existing = document.getElementById('settings-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.id        = 'settings-overlay';
        overlay.innerHTML = this._buildHTML();
        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.classList.add('visible'));

        this._wireEvents(overlay);
    }

    close() {
        const overlay = document.getElementById('settings-overlay');
        if (!overlay) return;
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }

    // ─── Screen Navigation ────────────────────────────────────────────────────

    showScreen(screenId) {
        document.querySelectorAll('.settings-screen')
            .forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    // ─── HTML Builders ────────────────────────────────────────────────────────

    _buildHTML() {
        return `
            <div class="settings-popup" id="settings-popup">
                ${this._buildMainScreen()}
                ${this._buildStatsScreen()}
                ${this._buildEditStatsScreen()}
                ${this._buildRulesScreen()}
                ${this._buildShareScreen()}
            </div>
        `;
    }

    _buildMainScreen() {
        const togglesHTML = this.toggles.map(({ key, label }) => `
            <label class="settings-toggle-row">
                <span class="toggle-label">${label}</span>
                <div class="toggle-switch ${this.settings.get(key) ? 'on' : ''}"
                     data-setting="${key}"></div>
            </label>
        `).join('');

        return `
            <div class="settings-screen active" id="settings-main">
                <div class="settings-header">
                    <span class="settings-title">Menu</span>
                    <button class="settings-close" id="settings-close">✕</button>
                </div>
                <div class="settings-actions">
                    <button class="settings-action-btn" id="btn-new-game">
                        <span class="action-icon">➕</span>
                        <span>New Game</span>
                    </button>
                    <button class="settings-action-btn" id="btn-restart">
                        <span class="action-icon">⏮</span>
                        <span>Restart Game</span>
                    </button>
                    <button class="settings-action-btn" id="btn-stats">
                        <span class="action-icon">📊</span>
                        <span>Statistics</span>
                        <span class="action-chevron">›</span>
                    </button>
                    <button class="settings-action-btn" id="btn-rules">
                        <span class="action-icon">📖</span>
                        <span>Rules</span>
                        <span class="action-chevron">›</span>
                    </button>
                    <button class="settings-action-btn" id="btn-share">
                        <span class="action-icon">🔗</span>
                        <span>Share & Install</span>
                        <span class="action-chevron">›</span>
                    </button>
                </div>
                <div class="settings-divider"></div>
                <div class="settings-toggles">
                    ${togglesHTML}
                </div>
                <div class="settings-version">v${this.version}</div>
            </div>
        `;
    }

    _buildStatsScreen() {
        const s = this.stats.get();
        const fmt = secs => GameTimer.format(secs);
        const winRate = s.gamesPlayed > 0
            ? Math.round((s.gamesWon / s.gamesPlayed) * 100)
            : 0;

        return `
            <div class="settings-screen" id="settings-stats">
                <div class="settings-header">
                    <button class="settings-back" id="stats-back">‹</button>
                    <span class="settings-title">Statistics</span>
                    <div style="width:2em"></div>
                </div>
                <div class="stats-grid">
                    <div class="stat-cell">
                        <div class="stat-value">${s.gamesWon}</div>
                        <div class="stat-label">Won</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${winRate}%</div>
                        <div class="stat-label">Win Rate</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${s.gamesPlayed}</div>
                        <div class="stat-label">Total Played</div>
                    </div>

                    <div class="stat-cell">
                        <div class="stat-value">${s.bestMoves ?? '—'}</div>
                        <div class="stat-label">Best Moves</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${s.gamesWon > 0 ? Math.round(s.totalMoves / s.gamesWon) : '—'}</div>
                        <div class="stat-label">Avg Moves</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${s.totalMoves}</div>
                        <div class="stat-label">Total Moves</div>
                    </div>

                    <div class="stat-cell">
                        <div class="stat-value">${s.bestTime ? fmt(s.bestTime) : '—'}</div>
                        <div class="stat-label">Best Time</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${s.gamesWon > 0 ? fmt(Math.round(s.totalTime / s.gamesWon)) : '—'}</div>
                        <div class="stat-label">Avg Time</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${fmt(s.totalTime)}</div>
                        <div class="stat-label">Total Time</div>
                    </div>

                    <div class="stat-cell">
                        <div class="stat-value">${s.bestScore ?? '—'}</div>
                        <div class="stat-label">Best Score</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${s.gamesWon > 0 ? Math.round(s.totalScore / s.gamesWon) : '—'}</div>
                        <div class="stat-label">Avg Score</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${s.totalScore}</div>
                        <div class="stat-label">Total Score</div>
                    </div>

                    <div class="stat-cell">
                        <div class="stat-value">${s.bestStreak}</div>
                        <div class="stat-label">Best Streak</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value">${s.currentStreak}</div>
                        <div class="stat-label">Current Streak</div>
                    </div>
                </div>
                <div class="settings-divider"></div>
                <button class="settings-action-btn" id="btn-reset-stats"
                        style="margin: 3px 16px; width: calc(100% - 32px);">
                    <span class="action-icon">❌</span>
                    <span>Reset Statistics</span>
                </button>
                <button class="settings-action-btn" id="btn-edit-stats"
                        style="margin: 3px 16px; width: calc(100% - 32px);">
                    <span class="action-icon">✏️</span>
                    <span>Edit Statistics</span>
                    <span class="action-chevron">›</span>
                </button>
            </div>
        `;
    }

    _buildEditStatsScreen() {
        const s = this.stats.get();
        const fieldsHTML = this.statFields.map(({ key, label, isTime }) => {
            const value       = isTime ? GameTimer.secsToHMS(s[key] ?? 0) : (s[key] ?? 0);
            const type        = isTime ? 'text' : 'number';
            const placeholder = isTime ? 'h:mm:ss' : '';
            return `
                <div class="stats-edit-row">
                    <label class="stats-edit-label">${label}</label>
                    <input class="stats-edit-input" type="${type}" data-stat="${key}"
                        data-is-time="${isTime}" value="${value}" placeholder="${placeholder}">
                </div>
            `;
        }).join('');

        return `
            <div class="settings-screen" id="settings-edit-stats">
                <div class="settings-header">
                    <button class="settings-back" id="edit-stats-back">‹</button>
                    <span class="settings-title">Edit Statistics</span>
                    <div style="width:2em"></div>
                </div>
                <div class="settings-text-body">
                    <p>Enter your statistics from another app to import them into this one.</p>
                </div>
                <div class="stats-edit-grid">
                    ${fieldsHTML}
                </div>
                <button class="settings-action-btn" id="btn-save-stats"
                        style="margin: 8px 16px; width: calc(100% - 32px);">
                    <span class="action-icon">💾</span>
                    <span>Save</span>
                </button>
            </div>
        `;
    }

    _buildRulesScreen() {
        return `
            <div class="settings-screen" id="settings-rules">
                <div class="settings-header">
                    <button class="settings-back" id="rules-back">‹</button>
                    <span class="settings-title">Rules</span>
                    <div style="width:2em"></div>
                </div>
                <div class="settings-text-body">
                    ${this.rulesHTML}
                </div>
            </div>
        `;
    }

    _buildShareScreen() {
        return `
            <div class="settings-screen" id="settings-share">
                <div class="settings-header">
                    <button class="settings-back" id="share-back">‹</button>
                    <span class="settings-title">Share & Install</span>
                    <div style="width:2em"></div>
                </div>
                <div class="settings-text-body">
                    <h3>1. Discover in Browser</h3>
                    <p>Share this URL with anyone:</p>
                    <div class="share-url">${window.location.origin + window.location.pathname}</div>
                    <div id="qr-code"></div>
                    <h3>2. Add to Home Screen</h3>
                    <p><strong>iPhone / iPad:</strong> Tap the Share button (□↑) in Safari, then tap <em>Add to Home Screen</em>.</p>
                    <p><strong>Android:</strong> Tap the menu (⋮) in Chrome, then tap <em>Add to Home Screen</em>.</p>
                    <p><strong>Desktop:</strong> Click the install icon (⊕) in the address bar in Chrome or Edge.</p>
                </div>
            </div>
        `;
    }

    // ─── Event Wiring ─────────────────────────────────────────────────────────

    _wireEvents(overlay) {
        // Backdrop click closes overlay
        overlay.addEventListener('click', e => {
            if (e.target === overlay) this.close();
        });

        document.getElementById('settings-close').addEventListener('click', () => this.close());

        // Action buttons
        document.getElementById('btn-new-game').addEventListener('click', () => {
            this.close();
            this.onNewGame();
        });

        document.getElementById('btn-restart').addEventListener('click', () => {
            this.close();
            this.onRestart();
        });

        // Screen navigation
        document.getElementById('btn-stats').addEventListener('click',      () => this.showScreen('settings-stats'));
        document.getElementById('stats-back').addEventListener('click',     () => this.showScreen('settings-main'));
        document.getElementById('btn-rules').addEventListener('click',      () => this.showScreen('settings-rules'));
        document.getElementById('rules-back').addEventListener('click',     () => this.showScreen('settings-main'));
        document.getElementById('btn-edit-stats').addEventListener('click', () => this.showScreen('settings-edit-stats'));
        document.getElementById('edit-stats-back').addEventListener('click',() => this.showScreen('settings-stats'));

        document.getElementById('btn-share').addEventListener('click', () => {
            this.showScreen('settings-share');
            this._renderQRCode();
        });
        document.getElementById('share-back').addEventListener('click', () => this.showScreen('settings-main'));

        // Reset stats
        document.getElementById('btn-reset-stats').addEventListener('click', () => {
            if (confirm('Reset all statistics?')) {
                this.stats.reset();
                this.close();
                this.open(); // reopen to refresh displayed values
            }
        });

        // Save edited stats
        document.getElementById('btn-save-stats').addEventListener('click', () => {
            const updated = { ...this.stats.get() };
            document.querySelectorAll('.stats-edit-input').forEach(input => {
                const key    = input.dataset.stat;
                const isTime = input.dataset.isTime === 'true';
                const val    = isTime
                    ? GameTimer.HMSToSecs(input.value)
                    : parseInt(input.value, 10);
                if (val !== null && !isNaN(val) && val >= 0) updated[key] = val;
            });
            this.stats.set(updated);
            this.close();
            this.open(); // reopen to refresh displayed values
        });

        // Toggle switches
        overlay.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const key = toggle.dataset.setting;
                this.settings.toggle(key);
                toggle.classList.toggle('on', this.settings.get(key));
            });
        });
    }

    // ─── QR Code ──────────────────────────────────────────────────────────────

    _renderQRCode() {
        const el = document.getElementById('qr-code');
        if (!el || el.childElementCount > 0) return; // only render once
        new QRCode(el, {
            text:   window.location.origin + window.location.pathname,
            width:  160,
            height: 160,
        });
    }
}
