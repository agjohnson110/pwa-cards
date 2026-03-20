// Freecell Game Logic

const VERSION = '0.5.0';

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = this.getValue(rank);
        this.color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
        this.id = `${suit}-${rank}`;
        this.element = this.createElement(); // create once, keep forever
    }

    getValue(rank) {
        const values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        return values[rank];
    }

    getSuitSymbol() {
        // Unicode suit symbols for better visuals
        const map = { 'hearts': '\u2665', 'diamonds': '\u2666', 'clubs': '\u2663', 'spades': '\u2660' };
        return map[this.suit] || this.suit[0].toUpperCase();
    }

    // Create a DOM element for this card with appropriate classes and data attributes
    createElement() {
        const el = document.createElement('div');
        el.className = `card ${this.color}`;
        el.dataset.suit = this.suit;
        el.dataset.rank = this.rank;
        el.dataset.value = this.value;
        el.dataset.color = this.color;
        el.dataset.cardId = this.id;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', `${this.rank} of ${this.suit}`);

        // Corners: rank top-left / bottom-right, suit top-right / bottom-left
        const suit = this.getSuitSymbol();
        el.innerHTML = `
            <span class="corner tl rank">${this.rank}</span>
            <span class="corner tr suit">${suit}</span>
            <span class="corner bl suit">${suit}</span>
            <span class="corner br rank">${this.rank}</span>
            <div class="center-suit">${suit}</div>
        `;

        // Link DOM → model
        el.cardRef = this;
        return el;
    }
}

class FreecellGame {
    constructor() {
        this.deck = []; // id → Card, permanent lookup for all 52 cards
        this.cardMap = {};
        this.freeCells = [[], [], [], []]; // arrays of Card
        this.foundations = [[], [], [], []]; // arrays of Card
        this.tableau = [[], [], [], [], [], [], [], []]; // arrays of Card

        this.draggedCard = null; // Card
        this.draggedStack = [];  // Card[]
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.dragNotTap = false;
        this.tapThreshold = 8; // px movement allowed before it's considered a drag
        this.history = []; // for undo

        // Settings — loaded from localStorage, with defaults
        this.settings = this.loadSettings();

        // Statistics — loaded from localStorage
        this.stats = this.loadStats();

        // Game session tracking
        this.gameStartTime = null;
        this.moveCount = 0;
        this.gameActive = false;

        this.init();
        this.addEventListeners();
        this.applySettings();
    }

    // ─── Settings Persistence ─────────────────────────────────────────────────────

    defaultSettings() {
        return {
            showScore:      true,
            showMoves:      true,
            showTime:       true,
            autoMove:       true,
            showNumberBar:  true,
            showGrouping:   true,
            darkMode:       false,
        };
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('freecell-settings');
            return saved ? { ...this.defaultSettings(), ...JSON.parse(saved) } : this.defaultSettings();
        } catch {
            return this.defaultSettings();
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('freecell-settings', JSON.stringify(this.settings));
        } catch {}
    }

    // Apply all settings to the DOM (called on load and whenever a setting changes)
    applySettings() {
        document.body.classList.toggle('dark-mode',       this.settings.darkMode);
        document.body.classList.toggle('hide-number-bar', !this.settings.showNumberBar);
        document.body.classList.toggle('hide-score',      !this.settings.showScore);
        document.body.classList.toggle('hide-moves',      !this.settings.showMoves);
        document.body.classList.toggle('hide-time',       !this.settings.showTime);
        this.updateSequenceOutlines();
    }

    // ─── Statistics Persistence ───────────────────────────────────────────────────

    defaultStats() {
        return {
            gamesPlayed:   0,
            gamesWon:      0,
            bestMoves:     null,  // null = no win yet
            bestTime:      null,  // seconds
            bestScore:     null,
            currentStreak: 0,
            bestStreak:    0,
            totalMoves:    0,
            totalTime:     0,
            totalScore:    0,
        };
    }

    loadStats() {
        try {
            const saved = localStorage.getItem('freecell-stats');
            return saved ? { ...this.defaultStats(), ...JSON.parse(saved) } : this.defaultStats();
        } catch {
            return this.defaultStats();
        }
    }

    saveStats() {
        try {
            localStorage.setItem('freecell-stats', JSON.stringify(this.stats));
        } catch {}
    }

    recordGameStart() {
        this.gameStartTime = Date.now();
        this.moveCount     = 0;
        this.gameActive    = true;
        this.stats.gamesPlayed++;
        this.saveStats();

        // Clear any existing timer before starting a new one
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
            document.getElementById('timer').textContent = `Time: ${this.formatTime(elapsed)}`;
        }, 1000);
    }

    recordGameWin() {
        if (!this.gameActive) return;
        this.gameActive = false;

        const timeSecs = Math.floor((Date.now() - this.gameStartTime) / 1000);
        clearInterval(this.timerInterval);

        const finalScore = 520 - this.moveCount; //TODO have scoring function for here and UI.

        this.stats.gamesWon++;
        this.stats.currentStreak++;
        this.stats.bestStreak  = Math.max(this.stats.bestStreak, this.stats.currentStreak);
        this.stats.bestMoves   = this.stats.bestMoves === null ? this.moveCount  : Math.min(this.stats.bestMoves,  this.moveCount);
        this.stats.bestTime    = this.stats.bestTime  === null ? timeSecs        : Math.min(this.stats.bestTime,   timeSecs);
        this.stats.bestScore   = this.stats.bestScore  === null ? finalScore      : Math.max(this.stats.bestScore,  finalScore);
        this.stats.totalMoves += this.moveCount;
        this.stats.totalTime  += timeSecs;
        this.stats.totalScore += finalScore;

        this.saveStats();
    }

    recordGameAbandoned() {
        if (!this.gameActive) return;
        this.gameActive = false;
        clearInterval(this.timerInterval);
        this.stats.currentStreak = 0;
        this.saveStats();
    }

    // ─── Init ─────────────────────────────────────────────────────────────────────

    init() {
        document.getElementById('win-message').style.display = 'none';
        document.getElementById('win-stats').style.display          = 'none';
        document.getElementById('middle-btn-new-game').style.display = 'none';
        this.updateMovesAndScore();
        this.createDeck();
        this.shuffleDeck();
        this.dealCards();
        this.renderDOM();    // initial render without auto-move
        this.runAutoMoves(); // then run auto-moves (no animations on deal)
        this.registerServiceWorker();
        this.recordGameStart();
    }

    // Push new Card instances into this.deck for all 52 standard cards.
    // Also populates cardMap for permanent id → Card lookup.
    createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        for (let suit of suits) {
            for (let rank of ranks) {
                const card = new Card(suit, rank);
                this.deck.push(card);
                this.cardMap[card.id] = card; // permanent reference, survives deck being cleared
            }
        }
    }

    // Shuffle the deck using Fisher-Yates random algorithm
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    // Pop cards off the shuffled deck into tableau columns
    dealCards() {
        for (let col = 0; col < 8; col++) {
            const numCards = col < 4 ? 7 : 6;
            for (let i = 0; i < numCards; i++) {
                this.tableau[col].push(this.deck.pop());
            }
        }
        this.deck = []; // clear remaining references
    }

    // ─── Rendering ───────────────────────────────────────────────────────────────

    // Pure DOM sync: reads model arrays and updates the DOM to match.
    // Does NOT trigger auto-moves. Use render() for normal gameplay.
    renderDOM() {
        // Free cells
        for (let i = 0; i < 4; i++) {
            const cell = document.getElementById(`free${i + 1}`);
            cell.innerHTML = '';
            if (this.freeCells[i].length > 0) cell.appendChild(this.freeCells[i][0].element);
        }
        for (let i = 0; i < 4; i++) {
            const found = document.getElementById(`found${i + 1}`);
            found.innerHTML = '';
            for (const card of this.foundations[i]) found.appendChild(card.element);
        }
        for (let i = 0; i < 8; i++) {
            const col = document.getElementById(`col${i + 1}`);
            col.innerHTML = '';
            for (const card of this.tableau[i]) col.appendChild(card.element);
        }

        this.updateSequenceOutlines();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.adjustColumnSpacing();
            });
        });
    }

    // Full render: syncs DOM then runs animated auto-moves.
    // Use this after every player move.
    render() {
        this.renderDOM();
        this.runAutoMoves();
    }

    // ─── Column Compression ───────────────────────────────────────────────────────

    adjustColumnSpacing() {
        const tableauEl     = document.getElementById('tableau');
        const tableauHeight = tableauEl.getBoundingClientRect().height;

        for (let i = 0; i < 8; i++) {
            const colEl = document.getElementById(`col${i + 1}`);
            const cards = colEl.querySelectorAll('.card');

            if (cards.length <= 1) {
                colEl.style.removeProperty('--card-offset');
                continue;
            }

            const firstCard   = cards[0];
            const cardHeight  = firstCard.getBoundingClientRect().height;
            const cardWidth       = firstCard.getBoundingClientRect().width;
            const defaultMargin = -90;
            const defaultOverlap = defaultMargin * cardWidth * -.01;
            const defaultPeak = cardHeight - defaultOverlap;
            const defaultBottom = cardHeight + (cards.length - 1) * defaultPeak;

            if (defaultBottom < tableauHeight) {
                colEl.style.removeProperty('--card-offset'); // default fits, reset to default
                continue;
            }

            const availableHeight = tableauHeight - cardHeight; // space for overlapping cards
            const numOverlapping  = cards.length - 1;
            const desiredPeakPx = (availableHeight / numOverlapping);
            const desiredOverlapPx = cardHeight - desiredPeakPx;
            const newMarginTop = (desiredOverlapPx/cardWidth) * -100;
            colEl.style.setProperty('--card-offset', `${newMarginTop.toFixed(1)}%`);
        }
    }

    // ─── Animation ───────────────────────────────────────────────────────────────

    // FLIP animation: animates cardEls from fromRects to their current DOM positions.
    // fromRects: array of DOMRect captured BEFORE renderDOM() was called.
    // cardEls:   the corresponding card elements.
    animateCards(cardEls, fromRects) {
        const toRects = cardEls.map(el => el.getBoundingClientRect());

        // Collect all destination parents so we can set z-index on their entire contents
        const affectedParents = new Set(cardEls.map(el => el.parentElement).filter(Boolean));

        // Set z-index on every card in every affected column, not just the moving ones.
        // This ensures cards already in the destination don't float above the arriving card.
        affectedParents.forEach(parent => {
            Array.from(parent.children).forEach((el, i) => {
                el.style.zIndex = 100 + i;
            });
        });

        cardEls.forEach((el, i) => {
            const dx = fromRects[i].left - toRects[i].left;
            const dy = fromRects[i].top  - toRects[i].top;
            // Skip animation if card didn't actually move (e.g. invalid move snapped back)
            if (dx === 0 && dy === 0) return;
            el.style.transition = 'none';
            el.style.transform  = `translate(${dx}px, ${dy}px)`;
        });

        // Double rAF: first frame paints the inverted position, second triggers the transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEls.forEach(el => {
                    el.style.transition = 'transform 0.3s ease';
                    el.style.transform  = '';
                    el.addEventListener('transitionend', () => {
                        el.style.transition = '';
                    }, { once: true });
                });

                // Clear all z-index overrides after the animation completes.
                // Use the duration + a small buffer to ensure all transitions are done.
                setTimeout(() => {
                    affectedParents.forEach(parent => {
                        Array.from(parent.children).forEach(el => {
                            el.style.zIndex = '';
                        });
                    });
                }, 350); // slightly longer than the 0.3s transition
            });
        });
    }

    // ─── History / Undo ──────────────────────────────────────────────────────────

    // Snapshot the current state before a player move.
    // movedIds records which cards are about to move, for use by undo animation.
    saveHistory() {
        this.history.push({
            freeCells:   this.freeCells.map(cell => [...cell]),
            foundations: this.foundations.map(f    => [...f]),
            tableau:     this.tableau.map(col      => [...col]),
            movedIds:    this.draggedStack.map(c   => c.id)
        });

        // 5000 entries ≈ ~5MB max. Far exceeds any realistic game length (52 cards),
        // while guarding against degenerate cases.
        if (this.history.length > 5000) this.history.shift();
    }

    undo() {
        if (this.draggedCard || this.history.length === 0) return;

        const entry = this.history.pop();

        // Find cards that were auto-moved to foundations after the last player move.
        // These are cards present in the current foundations but absent in the snapshot.
        const autoMovedIds = [];
        for (let i = 0; i < 4; i++) {
            const savedLen   = entry.foundations[i].length;
            const currentLen = this.foundations[i].length;
            for (let j = savedLen; j < currentLen; j++) {
                autoMovedIds.push(this.foundations[i][j].id);
            }
        }

        // Animate both the manually moved cards and any auto-moved cards
        const allMovedIds = [...new Set([...entry.movedIds, ...autoMovedIds])];
        const cardEls     = allMovedIds.map(id => this.cardMap[id].element);
        const fromRects   = cardEls.map(el => el.getBoundingClientRect()); // current = "from" for undo

        // Restore model
        this.freeCells   = entry.freeCells;
        this.foundations = entry.foundations;
        this.tableau     = entry.tableau;

        // Sync DOM to restored state WITHOUT triggering new auto-moves
        this.renderDOM();

        // Animate cards back to their restored positions
        this.animateCards(cardEls, fromRects);
    }

    // ─── Settings Popup ───────────────────────────────────────────────────────────

    openSettings() {
        // Remove any existing popup first
        this.closeSettings();

        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        overlay.id = 'settings-overlay';

        overlay.innerHTML = `
            <div class="settings-popup" id="settings-popup">

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
                        <label class="settings-toggle-row">
                            <span class="toggle-label">Show Score</span>
                            <div class="toggle-switch ${this.settings.showScore ? 'on' : ''}" data-setting="showScore"></div>
                        </label>
                        <label class="settings-toggle-row">
                            <span class="toggle-label">Show Moves</span>
                            <div class="toggle-switch ${this.settings.showMoves ? 'on' : ''}" data-setting="showMoves"></div>
                        </label>
                        <label class="settings-toggle-row">
                            <span class="toggle-label">Show Timer</span>
                            <div class="toggle-switch ${this.settings.showTime ? 'on' : ''}" data-setting="showTime"></div>
                        </label>
                        <label class="settings-toggle-row">
                            <span class="toggle-label">Auto-move to Foundation</span>
                            <div class="toggle-switch ${this.settings.autoMove ? 'on' : ''}" data-setting="autoMove"></div>
                        </label>
                        <label class="settings-toggle-row">
                            <span class="toggle-label">Show Number Bar</span>
                            <div class="toggle-switch ${this.settings.showNumberBar ? 'on' : ''}" data-setting="showNumberBar"></div>
                        </label>
                        <label class="settings-toggle-row">
                            <span class="toggle-label">Highlight Grouped Cards</span>
                            <div class="toggle-switch ${this.settings.showGrouping ? 'on' : ''}" data-setting="showGrouping"></div>
                        </label>
                        <label class="settings-toggle-row">
                            <span class="toggle-label">Dark Mode</span>
                            <div class="toggle-switch ${this.settings.darkMode ? 'on' : ''}" data-setting="darkMode"></div>
                        </label>
                    </div>

                    <div class="settings-version">v${VERSION}</div>
                </div>

                <div class="settings-screen" id="settings-stats">
                    <div class="settings-header">
                        <button class="settings-back" id="stats-back">‹</button>
                        <span class="settings-title">Statistics</span>
                        <div style="width:2em"></div>
                    </div>

                    <div class="stats-grid">
                        
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.gamesWon}</div>
                            <div class="stat-label">Won</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.gamesPlayed > 0 ? Math.round((this.stats.gamesWon / this.stats.gamesPlayed) * 100) : 0}%</div>
                            <div class="stat-label">Win Rate</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.gamesPlayed}</div>
                            <div class="stat-label">Total Played</div>
                        </div>

                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.bestMoves ?? '—'}</div>
                            <div class="stat-label">Best Moves</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.gamesWon > 0 ? Math.round(this.stats.totalMoves / this.stats.gamesWon) : '—'}</div>
                            <div class="stat-label">Avg Moves</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.totalMoves}</div>
                            <div class="stat-label">Total Moves</div>
                        </div>

                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.bestTime ? this.formatTime(this.stats.bestTime) : '—'}</div>
                            <div class="stat-label">Best Time</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.gamesWon > 0 ? this.formatTime(Math.round(this.stats.totalTime / this.stats.gamesWon)) : '—'}</div>
                            <div class="stat-label">Avg Time</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.formatTime(this.stats.totalTime)}</div>
                            <div class="stat-label">Total Time</div>
                        </div>

                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.bestScore ?? '—'}</div>
                            <div class="stat-label">Best Score</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.gamesWon > 0 ? Math.round(this.stats.totalScore / this.stats.gamesWon) : '—'}</div>
                            <div class="stat-label">Avg Score</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.totalScore}</div>
                            <div class="stat-label">Total Score</div>
                        </div>

                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.bestStreak}</div>
                            <div class="stat-label">Best Streak</div>
                        </div>
                        <div class="stat-cell">
                            <div class="stat-value">${this.stats.currentStreak}</div>
                            <div class="stat-label">Current Streak</div>
                        </div>
                    </div>
                    <div class="settings-divider"></div>

                    <button class="settings-danger-btn" id="btn-reset-stats">Reset Statistics</button>
                    <button class="settings-action-btn" id="btn-edit-stats">
                        <span class="action-icon">✏️</span>
                        <span>Edit Statistics</span>
                        <span class="action-chevron">›</span>
                    </button>
                </div>

                <div class="settings-screen" id="settings-edit-stats">
                    <div class="settings-header">
                        <button class="settings-back" id="edit-stats-back">‹</button>
                        <span class="settings-title">Edit Statistics</span>
                        <div style="width:2em"></div>
                    </div>
                    <div class="settings-text-body">
                        <p>Enter your stats from another Freecell game to import them here.</p>
                    </div>
                    <div class="stats-edit-grid">
                        ${[
                            ['gamesPlayed', 'Games Played'],
                            ['gamesWon',    'Games Won'],
                            ['bestMoves',   'Best Moves'],
                            ['totalMoves',  'Total Moves'],
                            ['bestTime',    'Best Time'],
                            ['totalTime',   'Total Time'],
                            ['bestScore',   'Best Score'],
                            ['totalScore',  'Total Score'],
                            ['bestStreak',  'Best Streak'],
                            ['currentStreak','Current Streak'],
                        ].map(([key, label]) => {
                            const isTime = key === 'bestTime' || key === 'totalTime';
                            const value  = isTime ? this.secsToHMS(this.stats[key] ?? 0) : (this.stats[key] ?? 0);
                            const type   = isTime ? 'text' : 'number';
                            const placeholder = isTime ? 'h:mm:ss' : '';
                            return `
                                <div class="stats-edit-row">
                                    <label class="stats-edit-label">${label}</label>
                                    <input class="stats-edit-input" type="${type}" data-stat="${key}" 
                                        data-is-time="${isTime}" value="${value}" placeholder="${placeholder}">
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <button class="settings-action-btn" id="btn-save-stats" style="margin: 8px 16px; width: calc(100% - 32px);">
                        <span class="action-icon">💾</span>
                        <span>Save</span>
                    </button>
                </div>

                <div class="settings-screen" id="settings-rules">
                    <div class="settings-header">
                        <button class="settings-back" id="rules-back">‹</button>
                        <span class="settings-title">Rules</span>
                        <div style="width:2em"></div>
                    </div>
                    <div class="settings-text-body">
                        <h3>Objective</h3>
                        <p>Move all 52 cards to the four foundation piles. The game is won when all cards are on the foundations.</p>
                        <h3>Foundations</h3>
                        <p>The four foundation piles in the top left are built up by suit from Ace to King.</p>
                        <h3>Free Cells</h3>
                        <p>The four cells in the top right can each hold any one card temporarily.</p>
                        <h3>Tableau</h3>
                        <p>Cards placed on a column must be one rank lower and opposite in color to the card they're placed on.</p>
                        <h3>Moves</h3>
                        <p>You move cards one at a time. You may move a sequence of cards if you have enough free cells and empty columns.</p>
                    </div>
                </div>

                <div class="settings-screen" id="settings-share">
                    <div class="settings-header">
                        <button class="settings-back" id="share-back">‹</button>
                        <span class="settings-title">Share & Install</span>
                        <div style="width:2em"></div>
                    </div>
                    <div class="settings-text-body">
                        <h3>1. Discover in Browser</h3>
                        <p>Share this URL with anyone:</p>
                        <div class="share-url">${window.location.origin}</div>
                        <div id="qr-code"></div>
                        <h3>2. Add to Home Screen</h3>
                        <p><strong>iPhone / iPad:</strong> Tap the Share button (□↑) in Safari, then tap <em>Add to Home Screen</em>.</p>
                        <p><strong>Android:</strong> Tap the menu (⋮) in Chrome, then tap <em>Add to Home Screen</em>.</p>
                        <p><strong>Desktop:</strong> Click the install icon (⊕) in the address bar in Chrome or Edge.</p>
                    </div>
                </div>

            </div>
        `;

        document.body.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => overlay.classList.add('visible'));

        // Wire up events inside the popup
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeSettings(); // click backdrop to close
        });

        document.getElementById('settings-close').addEventListener('click', () => this.closeSettings());

        document.getElementById('btn-new-game').addEventListener('click', () => {
            this.closeSettings();
            this.recordGameAbandoned();
            this.resetGame();
        });

        document.getElementById('btn-restart').addEventListener('click', () => {
            this.closeSettings();
            this.recordGameAbandoned();
            this.restartGame();
        });

        document.getElementById('btn-stats').addEventListener('click', () => {
            this.showSettingsScreen('settings-stats');
        });

        document.getElementById('stats-back').addEventListener('click', () => {
            this.showSettingsScreen('settings-main');
        });

        document.getElementById('btn-reset-stats').addEventListener('click', () => {
            if (confirm('Reset all statistics?')) {
                this.stats = this.defaultStats();
                this.saveStats();
                this.closeSettings();
                this.openSettings(); // reopen to refresh displayed values
            }
        });

        document.getElementById('btn-edit-stats').addEventListener('click', () => {
            this.showSettingsScreen('settings-edit-stats');
        });
        document.getElementById('edit-stats-back').addEventListener('click', () => {
            this.showSettingsScreen('settings-stats');
        });
        document.getElementById('btn-save-stats').addEventListener('click', () => {
            const inputs = document.querySelectorAll('.stats-edit-input');
            inputs.forEach(input => {
                const key    = input.dataset.stat;
                const isTime = input.dataset.isTime === 'true';
                const val    = isTime ? this.HMSToSecs(input.value) : parseInt(input.value, 10);
                if (val !== null && !isNaN(val) && val >= 0) this.stats[key] = val;
            });
            this.saveStats();
            this.showSettingsScreen('settings-stats');
            this.closeSettings();
            this.openSettings(); // refresh displayed values
        });

        document.getElementById('btn-rules').addEventListener('click', () => {
            this.showSettingsScreen('settings-rules');
        });
        document.getElementById('rules-back').addEventListener('click', () => {
            this.showSettingsScreen('settings-main');
        });

        document.getElementById('btn-share').addEventListener('click', () => {
            this.showSettingsScreen('settings-share');
            this.renderQRCode();
        });
        document.getElementById('share-back').addEventListener('click', () => {
            this.showSettingsScreen('settings-main');
        });

        // Toggle switches
        overlay.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const setting = toggle.dataset.setting;
                this.settings[setting] = !this.settings[setting];
                toggle.classList.toggle('on', this.settings[setting]);
                this.saveSettings();
                this.applySettings();
            });
        });
    }

    showSettingsScreen(screenId) {
        document.querySelectorAll('.settings-screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    closeSettings() {
        const overlay = document.getElementById('settings-overlay');
        if (!overlay) return;
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }

    renderQRCode() {
        const el = document.getElementById('qr-code');
        if (!el || el.childElementCount > 0) return; // only render once
        new QRCode(el, {
            text: window.location.origin,
            width: 160,
            height: 160,
        });
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    secsToHMS(totalSecs) {
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    HMSToSecs(str) {
        const parts = str.split(':').map(p => parseInt(p, 10));
        if (parts.some(isNaN)) return null;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1]; // also accept mm:ss
        if (parts.length === 1) return parts[0];                  // also accept raw seconds
        return null;
    }

    // ─── Event Listeners ─────────────────────────────────────────────────────────

    addEventListeners() {
        // Touch events for iOS (pointer events unreliable on iOS)
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove',  this.handleTouchMove.bind(this),  { passive: false });
        document.addEventListener('touchend',   this.handleTouchEnd.bind(this),   { passive: false });

        // Pointer events for mouse on desktop — skip if touch already handled it
        document.addEventListener('pointerdown',   this.handlePointerDown.bind(this));
        document.addEventListener('pointermove',   this.handlePointerMove.bind(this));
        document.addEventListener('pointerup',     this.handlePointerUp.bind(this));
        document.addEventListener('pointercancel', this.handlePointerUp.bind(this));

        document.addEventListener('click', (e) => {
            const button = e.target.closest('.top-button');
            if (!button) return;
            switch (button.dataset.action) {
                case 'undo':     this.undo();         break;
                case 'settings': this.openSettings(); break;
            }
        });

        document.getElementById('middle-btn-new-game').addEventListener('click', () => {
            this.resetGame();
        });

        // Number bar highlight
        const numBar = document.querySelector('.number-bar');

        numBar.addEventListener('touchstart', (e) => {
            const num = e.target.closest('.num');
            if (!num) return;
            e.preventDefault(); // prevent the touch from also firing a click
            this.highlightCards(num.dataset.value);
        }, { passive: false });

        numBar.addEventListener('touchend', () => this.clearHighlight());

        numBar.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return;
            const num = e.target.closest('.num');
            if (!num) return;
            this.highlightCards(num.dataset.value);
        });

        numBar.addEventListener('pointerup',    (e) => { if (e.pointerType !== 'touch') this.clearHighlight(); });
        
        // Safety net: if the pointer leaves the number bar entirely, clear the highlight
        numBar.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') this.clearHighlight(); });

        // redo column spacing on orientation change and viewport size changes
        window.addEventListener('resize', () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.adjustColumnSpacing();
                });
            });
        });
    }

    // ─── Card Highlight ───────────────────────────────────────────────────────────

    highlightCards(value) {
        // Build a set of card IDs to highlight before touching the DOM
        const toHighlight = new Set();

        if (['hearts', 'diamonds', 'clubs', 'spades'].includes(value)) {
            // Find how many of this suit are already in the foundation
            const foundationPile  = this.foundations.find(f => f.length > 0 && f[0].suit === value);
            const foundationCount = foundationPile ? foundationPile.length : 0;

            // The next 3 ranks above what's already in the foundation, with a max of King (13)
            const nextValues      = [foundationCount + 1, foundationCount + 2, foundationCount + 3].filter(v => v <= 13);
            nextValues.forEach(v => {
                const card = Object.values(this.cardMap).find(c => c.suit === value && c.value === v);
                if (card) toHighlight.add(card.id);
            });
        }

        document.querySelectorAll('.card').forEach(el => {
            const card = this.getCardFromElement(el);
            if (!card) return;
            const matches = ['hearts', 'diamonds', 'clubs', 'spades'].includes(value)
                ? toHighlight.has(card.id)
                : card.rank === value;
            el.classList.toggle('highlighted', matches);
            el.classList.toggle('dimmed',      !matches);
        });
    }

    clearHighlight() {
        document.querySelectorAll('.card').forEach(el => el.classList.remove('highlighted', 'dimmed'));
    }

    updateSequenceOutlines() {
        // Clear all existing sequence classes
        document.querySelectorAll('.card.seq-top, .card.seq-mid, .card.seq-bot, .card.seq-solo')
            .forEach(el => el.classList.remove('seq-top', 'seq-mid', 'seq-bot', 'seq-solo'));

        if (!this.settings.showGrouping) return;

        for (let i = 0; i < 8; i++) {
            const col = this.tableau[i];
            if (col.length === 0) continue;

            // Find all sequence boundaries in this column.
            // A sequence break occurs when the next card is NOT the correct alternating color
            // and descending rank from the current card.
            const breaksBefore = new Set(); // indices where a new sequence starts
            breaksBefore.add(0);            // first card always starts a sequence

            for (let j = 0; j < col.length - 1; j++) {
                const curr = col[j];
                const next = col[j + 1];
                const isSequence = next.color !== curr.color && next.value === curr.value - 1;
                if (!isSequence) breaksBefore.add(j + 1);
            }

            // Now assign classes based on where sequences start and end
            for (let j = 0; j < col.length; j++) {
                const isStart = breaksBefore.has(j);
                const isEnd   = breaksBefore.has(j + 1) || j === col.length - 1;

                let cls;
                if      ( isStart &&  isEnd) cls = null; // sequence of length 1
                else if ( isStart && !isEnd) cls = 'seq-top';
                else if (!isStart &&  isEnd) cls = 'seq-bot';
                else                         cls = 'seq-mid';

                col[j].element.classList.add(cls);
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    getCardFromElement(el) {
        return el?.cardRef || null;
    }

    // Returns { type, index, arr } for a pile container element.
    // Reads data-pile-type and data-pile-index attributes set in HTML.
    // Kept separate from CSS classes since classes are for styling and may change.
    getPileForElement(containerEl) {
        if (!containerEl) return null;
        const type  = containerEl.dataset.pileType; // dataset.pileType comes from data-pile-type in html. Separate from class since class is used for styling and may have multiple values, while data-pile-type is strictly for identifying the type of pile.
        const index = parseInt(containerEl.dataset.pileIndex, 10);
        if (isNaN(index) || !type) return null; // element isn't a pile container
        switch (type) {
            case 'cell':       return { type, index, arr: this.freeCells[index] }; //property name can automatch variable name (type: type)
            case 'foundation': return { type, index, arr: this.foundations[index] };
            case 'column':     return { type, index, arr: this.tableau[index] };
            default:           return null;
        }
    }

    // ─── Touch Handlers ──────────────────────────────────────────────────────────

    handleTouchStart(e) {
        const touch    = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.dragNotTap  = false;

        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.card');
        if (!targetEl) return;

        const card = this.getCardFromElement(targetEl);
        if (!card) return;

        this.draggedCard = card;

        const pile = this.getPileForElement(targetEl.parentElement);
        if (!pile) return;

        const idx = pile.arr.indexOf(card); // Find the position of the touched card
        this.draggedStack = pile.arr.slice(idx); //cards from here to end - shallow copy — card refs, not clones

        if (this.preMoveCheckFailed()) { //trapped or too few empty cells
            this.draggedCard  = null;
            this.draggedStack = [];
            return;
        }

        // 1. Capture natural positions BEFORE adding .dragging
        this._dragStartRects = this.draggedStack.map(c => c.element.getBoundingClientRect());

        // 2. Add class AND immediately pin each card to its captured position
        this.draggedStack.forEach((c, i) => {
            const r = this._dragStartRects[i];
            c.element.style.left  = `${r.left}px`;
            c.element.style.top   = `${r.top}px`;
            c.element.style.width = `${r.width}px`;
            c.element.classList.add('dragging');
        });
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (!this.draggedCard) return;

        const touch  = e.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;

        if (!this.dragNotTap && (Math.abs(deltaX) > this.tapThreshold || Math.abs(deltaY) > this.tapThreshold)) {
            this.dragNotTap = true;
        }

        /*this.draggedStack.forEach(c => {
            c.element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });*/

        this.draggedStack.forEach((c, i) => {
            const origin = this._dragStartRects[i];
            c.element.style.left  = `${origin.left + deltaX}px`;
            c.element.style.top   = `${origin.top  + deltaY}px`;
            c.element.style.width = `${origin.width}px`;
        });
    }

    handleTouchEnd(e) {
        if (!this.draggedCard) return;

        this.draggedStack.forEach(c => {
            c.element.classList.remove('dragging');
            c.element.style.transform = '';
            c.element.style.left  = '';
            c.element.style.top   = '';
            c.element.style.width = '';
        });

        if (this.dragNotTap) {
            const touch    = e.changedTouches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            this.attemptMove(targetEl, true);  // drag — no tap animation
        } else {
            this.attemptMove(this.findBestTarget(), false); // tap — animate the move
        }

        this.draggedCard  = null;
        this.draggedStack = [];
    }

    // ─── Pointer Handlers (mouse / stylus) ───────────────────────────────────────

    handlePointerDown(e) {
        if (e.pointerType === 'touch') return; // already handled by touch events
        if (e.isPrimary === false)     return;
        e.preventDefault();

        this.touchStartX = e.clientX;
        this.touchStartY = e.clientY;
        this.dragNotTap  = false;

        const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
        if (!targetEl) return;

        const card = this.getCardFromElement(targetEl);
        if (!card) return;

        this.draggedCard = card;

        const pile = this.getPileForElement(targetEl.parentElement);
        if (!pile) return;

        const idx = pile.arr.indexOf(card);
        this.draggedStack = pile.arr.slice(idx);

        if (this.preMoveCheckFailed()) {
            this.draggedCard  = null;
            this.draggedStack = [];
            return;
        }

        // 1. Capture natural positions BEFORE adding .dragging
        this._dragStartRects = this.draggedStack.map(c => c.element.getBoundingClientRect());

        // 2. Add class AND immediately pin each card to its captured position
        this.draggedStack.forEach((c, i) => {
            const r = this._dragStartRects[i];
            c.element.style.left  = `${r.left}px`;
            c.element.style.top   = `${r.top}px`;
            c.element.style.width = `${r.width}px`;
            c.element.classList.add('dragging');
        });

        try { targetEl.setPointerCapture?.(e.pointerId); } catch {}
    }

    handlePointerMove(e) {
        if (e.pointerType === 'touch') return;
        if (!this.draggedCard)         return;
        e.preventDefault();

        const deltaX = e.clientX - this.touchStartX;
        const deltaY = e.clientY - this.touchStartY;

        if (!this.dragNotTap && (Math.abs(deltaX) > this.tapThreshold || Math.abs(deltaY) > this.tapThreshold)) {
            this.dragNotTap = true;
        }

        /*this.draggedStack.forEach(c => {
            c.element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });*/

        this.draggedStack.forEach((c, i) => {
            const origin = this._dragStartRects[i];
            c.element.style.left  = `${origin.left + deltaX}px`;
            c.element.style.top   = `${origin.top  + deltaY}px`;
            c.element.style.width = `${origin.width}px`;
        });
    }

    handlePointerUp(e) {
        if (e.pointerType === 'touch') return;
        if (!this.draggedCard)         return;

        this.draggedStack.forEach(c => {
            c.element.classList.remove('dragging');
            c.element.style.transform = '';
            c.element.style.left  = '';
            c.element.style.top   = '';
            c.element.style.width = '';
        });

        if (this.dragNotTap) {
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            this.attemptMove(targetEl, true); // drag — no tap animation
        } else {
            this.attemptMove(this.findBestTarget(), false); // tap — animate the move
        }

        try { this.draggedCard.element.releasePointerCapture?.(e.pointerId); } catch {}
        this.draggedCard  = null;
        this.draggedStack = [];
    }

    // ─── Move Logic ──────────────────────────────────────────────────────────────

    // Returns true if the dragged stack cannot legally be picked up.
    preMoveCheckFailed() {
        for (let i = 0; i < this.draggedStack.length - 1; i++) {
            const curr = this.draggedStack[i];
            const next = this.draggedStack[i + 1];
            if (next.color === curr.color)     return true; // same color — not a valid sequence
            if (next.value !== curr.value - 1) return true; // not descending — not a valid sequence
        }
        const freeCellsAvailable    = this.freeCells.filter(c => c.length === 0).length;
        const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length;
        return this.draggedStack.length > (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1);
    }

    // Finds the best destination for a tap move using model-based priority ordering.
    findBestTarget() {
        const card         = this.draggedCard;
        const stack        = this.draggedStack;
        const cardParentEl = card.element.parentElement;
        const currentPile  = this.getPileForElement(cardParentEl);

        const columnPiles = this.tableau.map((arr, i) => ({
            type: 'column', index: i, arr, el: document.getElementById(`col${i + 1}`)
        }));
        const cellPiles = this.freeCells.map((arr, i) => ({
            type: 'cell', index: i, arr, el: document.getElementById(`free${i + 1}`)
        }));
        const foundationPiles = this.foundations.map((arr, i) => ({
            type: 'foundation', index: i, arr, el: document.getElementById(`found${i + 1}`)
        }));

        if (stack.length > 1) {
            // Stacks can only go to columns: non-empty first, empty second
            const hit =
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length > 0  && this.isValidMove(card, stack, p)) ||
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p));
            return hit?.el || cardParentEl;
        }

        // Single card: non-empty columns → free cells → empty columns → foundations
        const hit =
            columnPiles.find(p    => p.el !== cardParentEl && p.arr.length > 0  && this.isValidMove(card, stack, p)) ||
            cellPiles.find(p      => currentPile?.type !== 'cell'                && this.isValidMove(card, stack, p)) ||
            columnPiles.find(p    => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p)) ||
            foundationPiles.find(p =>                                               this.isValidMove(card, stack, p));

        return hit?.el || cardParentEl;
    }

    // Validates and executes a move, then renders and checks for win.
    // isDrag: true when the card was physically dragged (skip tap animation).
    attemptMove(targetEl, isDrag = false) {
        if (!targetEl) return;

        const sourceEl = this.draggedCard.element.parentElement;
        const destEl   = targetEl.closest('.cell, .foundation, .column')
                      || targetEl.parentElement?.closest('.cell, .foundation, .column');

        if (!destEl || sourceEl === destEl) return;

        const destPile = this.getPileForElement(destEl);
        if (!destPile) return;

        if (this.isValidMove(this.draggedCard, this.draggedStack, destPile)) {
            this.saveHistory();
            this.moveCount++;
            this.updateMovesAndScore();

            // Capture positions BEFORE render for tap animation
            const cardEls   = this.draggedStack.map(c => c.element);
            const fromRects = isDrag ? null : cardEls.map(el => el.getBoundingClientRect());

            this.moveCard(sourceEl, destEl, this.draggedCard.id);
            this.render(); // renderDOM + runAutoMoves

            if (!isDrag) this.animateCards(cardEls, fromRects);

            if (this.checkWin()) {
                this.showWinState();
            }
        }
    }

    // Pure model-based move validation.
    // movingCard: Card, movingStack: Card[], destPile: { type, index, arr }
    isValidMove(movingCard, movingStack, destPile) {
        if (!destPile) return false;

        if (destPile.type === 'cell') {
            if (movingStack.length > 1) return false;   // cells hold only one card
            return destPile.arr.length === 0;            // must be empty
        }

        if (destPile.type === 'foundation') {
            if (movingStack.length > 1) return false; //move only one card to foundation at a time
            if (destPile.arr.length === 0) return movingCard.rank === 'A'; // only Aces can go to empty foundation
            const topCard = destPile.arr[destPile.arr.length - 1];
            return topCard.suit === movingCard.suit && topCard.value === movingCard.value - 1; // must be same suit and one rank lower
        }

        if (destPile.type === 'column') {
            if (destPile.arr.length === 0) {
                const freeCellsAvailable    = this.freeCells.filter(c => c.length === 0).length;
                const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length - 1; // exclude dest column
                return movingStack.length <= (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1);
            }
            const topCard = destPile.arr[destPile.arr.length - 1];
            return topCard.color !== movingCard.color && topCard.value === movingCard.value + 1; // must be opposite color and one rank higher
        }

        return false;
    }

    // Moves Card(s) in the model arrays. DOM is updated separately via renderDOM().
    moveCard(sourceEl, destEl, cardId) {
        const sourcePile = this.getPileForElement(sourceEl);
        const destPile   = this.getPileForElement(destEl);
        if (!sourcePile || !destPile) return;

        const startIdx = sourcePile.arr.findIndex(c => c.id === cardId);
        if (startIdx === -1) return;

        // Columns can move a stack; cells and foundations always move exactly one card
        const moving = sourcePile.type === 'column'
            ? sourcePile.arr.splice(startIdx)
            : sourcePile.arr.splice(startIdx, 1);

        if (destPile.type === 'column') {
            destPile.arr.push(...moving);
        } else if (destPile.type === 'cell' || destPile.type === 'foundation') {
            if (moving.length === 1) destPile.arr.push(moving[0]);
        }
    }

    // ─── Auto-move ───────────────────────────────────────────────────────────────

    findNextAutoMove() {
        // Respect the autoMove setting
        if (!this.settings.autoMove) return null;

        const candidates = [
            ...this.tableau.map((arr, i)   => ({ arr, el: document.getElementById(`col${i + 1}`) })),
            ...this.freeCells.map((arr, i) => ({ arr, el: document.getElementById(`free${i + 1}`) }))
        ].filter(p => p.arr.length > 0);

        for (const source of candidates) {
            const movingCard  = source.arr[source.arr.length - 1];
            const movingValue = movingCard.value;
            const movingColor = movingCard.color;

            for (let j = 0; j < 4; j++) {
                const foundationEl   = document.getElementById(`found${j + 1}`);
                const foundationPile = this.getPileForElement(foundationEl);

                if (!this.isValidMove(movingCard, [movingCard], foundationPile)) continue;

                // Aces and 2s are always safe to auto-move
                if (movingValue <= 2) {
                    return { card: movingCard, sourceEl: source.el, foundationEl };
                }

                // Higher cards only auto-move if both opposite-colour foundations are caught up,
                // meaning the card can never be needed to sequence on in the tableau
                let readyToMove = 0;
                for (let k = 0; k < 4; k++) {
                    const fPile = this.getPileForElement(document.getElementById(`found${k + 1}`));
                    if (!fPile || fPile.arr.length === 0) continue;
                    const topCard = fPile.arr[fPile.arr.length - 1];
                    if (movingColor === 'red') {
                        if ((topCard.suit === 'clubs' || topCard.suit === 'spades') && topCard.value >= movingValue - 2) readyToMove++;
                    } else {
                        if ((topCard.suit === 'hearts' || topCard.suit === 'diamonds') && topCard.value >= movingValue - 2) readyToMove++;
                    }
                }
                if (readyToMove === 2) {
                    return { card: movingCard, sourceEl: source.el, foundationEl };
                }
            }
        }
        return null;
    }

    // Executes all pending auto-moves one at a time, animating each card independently.
    // Called by render() after renderDOM(). Each card animates from its pre-move
    // position to its foundation position.
    runAutoMoves() {
        let next = this.findNextAutoMove();
        while (next) {
            const { card, sourceEl, foundationEl } = next;

            // Capture position BEFORE the move
            const fromRect = card.element.getBoundingClientRect();

            this.moveCard(sourceEl, foundationEl, card.id);
            this.renderDOM(); // sync DOM without recursing into runAutoMoves

            // Capture position AFTER render
            const toRect = card.element.getBoundingClientRect();
            const dx = fromRect.left - toRect.left;
            const dy = fromRect.top  - toRect.top;

            if (dx !== 0 || dy !== 0) {
                // Use an IIFE to capture the correct element reference in the closure
                ((el) => {
                    el.classList.add('animating');
                    el.style.transition = 'none';
                    el.style.transform  = `translate(${dx}px, ${dy}px)`;
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            el.style.transition = 'transform 0.3s ease';
                            el.style.transform  = '';
                            el.addEventListener('transitionend', () => {
                                el.style.transition = '';
                                el.classList.remove('animating');
                            }, { once: true });
                        });
                    });
                })(card.element);
            }

            next = this.findNextAutoMove();
        }
    }

    // ─── Win / Reset ─────────────────────────────────────────────────────────────

    updateMovesAndScore() {
        document.getElementById('moves').textContent = `Moves: ${this.moveCount}`;
        if (this.settings.showScore) {
            const score = 520 - this.moveCount;
            // Alternative scoring: 520 - moveCount (10 pts per foundation card - 1 per move)
            // Alternative scoring: Math.max(0, 500 - this.moveCount * 5 + Math.floor((Date.now() - this.gameStartTime) / 1000));
            document.getElementById('score').textContent = `Score: ${score}`;
        }
    }

    checkWin() {
        return this.foundations.every(f => f.length === 13);
    }

    showWinState() {
        const timeSecs   = Math.floor((Date.now() - this.gameStartTime) / 1000);
        const finalScore = 520 - this.moveCount;

        // Capture bests BEFORE recordGameWin() updates them
        const prevBestTime  = this.stats.bestTime;
        const prevBestScore = this.stats.bestScore;
        const prevBestMoves = this.stats.bestMoves;
        const prevBestStreak = this.stats.bestStreak;

        this.recordGameWin();

        const isNewBestTime  = prevBestTime  === null || timeSecs    < prevBestTime;
        const isNewBestScore = prevBestScore === null || finalScore  > prevBestScore;
        const isNewBestMoves = prevBestMoves === null || this.moveCount < prevBestMoves;
        const isNewBestStreak = prevBestStreak === null || this.stats.currentStreak > prevBestStreak;

        const fmt = s => this.formatTime(s);
        const row = (label, thisVal, bestVal, isBest) => `
            <tr>
                <td class="win-stat-label">${label}</td>
                <td class="win-stat-this">${thisVal}</td>
                <td class="win-stat-best ${isBest ? 'is-best' : ''}">${bestVal}${isBest ? ' ★' : ''}</td>
            </tr>`;

        document.getElementById('win-stats').innerHTML = `
            <table>
                <tr>
                    <td class="win-stat-label"></td>
                    <td class="win-stat-this"><u>This Game</u></td>
                    <td class="win-stat-best"><u>Best</u></td>
                </tr>
                ${row('Time',   fmt(timeSecs),        fmt(this.stats.bestTime),  isNewBestTime)}
                ${row('Score',  finalScore,            this.stats.bestScore,      isNewBestScore)}
                ${row('Moves',  this.moveCount,        this.stats.bestMoves,      isNewBestMoves)}
                ${row('Streak', this.stats.currentStreak,   this.stats.bestStreak,     isNewBestStreak)}
            </table>`;

        document.getElementById('win-message').style.display        = 'block';
        document.getElementById('win-stats').style.display          = 'block';
        document.getElementById('middle-btn-new-game').style.display = 'flex'; // flex to keep the icon+text row layout
    }

    restartGame() {
        if (this.history.length === 0) return; // nothing to restart, game is at start

        // The oldest history entry contains the state at the very beginning of the game
        const initial = this.history[0];

        this.freeCells   = initial.freeCells.map(cell => [...cell]);
        this.foundations = initial.foundations.map(f    => [...f]);
        this.tableau     = initial.tableau.map(col      => [...col]);

        this.history  = [];
        this.moveCount = 0;

        // Clear the old interval and start a fresh one
        clearInterval(this.timerInterval);
        this.gameStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
            document.getElementById('timer').textContent = `Time: ${this.formatTime(elapsed)}`;
        }, 1000);

        this.renderDOM();
        this.runAutoMoves();
        this.updateMovesAndScore();
    }

    clearCacheAndReset() {
        if ('caches' in window) {
            caches.keys().then(names => names.forEach(name => caches.delete(name)));
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        }
        this.resetGame();
    }

    resetGame() {
        this.deck         = [];
        this.cardMap      = {};
        this.freeCells    = [[], [], [], []];
        this.foundations  = [[], [], [], []];
        this.tableau      = [[], [], [], [], [], [], [], []];
        this.draggedCard  = null;
        this.draggedStack = [];
        this.history      = [];
        this.moveCount    = 0;
        this.gameActive   = false;
        clearInterval(this.timerInterval);
        this.init();
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log('SW registered'))
                .catch(() => console.log('SW registration failed'));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FreecellGame();
});
