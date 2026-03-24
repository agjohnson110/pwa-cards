// Spider Solitaire

const VERSION = '0.1.3';

class SpiderGame {
    constructor() {
        // ─── Shared: Storage ─────────────────────────────────────────────────
        this.settingsStorage = new StorageManager('spider-settings');
        this.statsStorage    = new StorageManager('spider-stats');

        // ─── Shared: Settings ────────────────────────────────────────────────
        this.settings = new SettingsManager(
            this.settingsStorage,
            {
                showScore:     true,
                showMoves:     true,
                showTime:      true,
                showNumberBar: true,
                showGrouping:  true,
                darkMode:      false,
                difficulty:    1,    // 1 = one suit, 2 = two suits, 4 = four suits
            },
            {
                darkMode:      'dark-mode',
                showScore:     'hide-score',
                showMoves:     'hide-moves',
                showTime:      'hide-time',
                showNumberBar: 'hide-number-bar',
            },
            () => this.updateSequenceOutlines() // onApply hook
        );

        // ─── Shared: Stats ───────────────────────────────────────────────────
        this.stats = new StatsManager(
            this.statsStorage,
            {
                gamesPlayed:   0,
                gamesWon:      0,
                bestMoves:     null,
                bestTime:      null,
                bestScore:     null,
                currentStreak: 0,
                bestStreak:    0,
                totalMoves:    0,
                totalTime:     0,
                totalScore:    0,
            }
        );

        // ─── Shared: Timer ───────────────────────────────────────────────────
        this.timer = new GameTimer(formatted => {
            document.getElementById('timer').textContent = `Time: ${formatted}`;
        });

        // ─── Shared: Column layout ───────────────────────────────────────────
        this.layout = new ColumnLayout({
            tableauId:    'tableau',
            columnPrefix: 'col',
            columnCount:  10,
        });

        // ─── Shared: Settings UI ─────────────────────────────────────────────
        this.settingsUI = new SettingsUI({
            version:  VERSION,
            settings: this.settings,
            stats:    this.stats,
            toggles: [
                { key: 'showScore',     label: 'Show Score'      },
                { key: 'showMoves',     label: 'Show Moves'      },
                { key: 'showTime',      label: 'Show Timer'      },
                { key: 'showNumberBar', label: 'Show Number Bar' },
                { key: 'showGrouping',  label: 'Highlight Grouped Cards' },
                { key: 'darkMode',      label: 'Dark Mode'       },
            ],
            statFields: [
                { key: 'gamesPlayed',   label: 'Games Played',   isTime: false },
                { key: 'gamesWon',      label: 'Games Won',      isTime: false },
                { key: 'bestMoves',     label: 'Best Moves',     isTime: false },
                { key: 'totalMoves',    label: 'Total Moves',    isTime: false },
                { key: 'bestTime',      label: 'Best Time',      isTime: true  },
                { key: 'totalTime',     label: 'Total Time',     isTime: true  },
                { key: 'bestScore',     label: 'Best Score',     isTime: false },
                { key: 'totalScore',    label: 'Total Score',    isTime: false },
                { key: 'bestStreak',    label: 'Best Streak',    isTime: false },
                { key: 'currentStreak', label: 'Current Streak', isTime: false },
            ],
            rulesHTML: `
                <h3>Objective</h3>
                <p>Build 8 complete sequences of cards from King down to Ace in the same suit. Each completed sequence is removed from the tableau.</p>
                <h3>Tableau</h3>
                <p>Cards are dealt into 10 columns. You can move a card onto any card that is one rank higher. You can only move a sequence of cards together if they are all the same suit.</p>
                <h3>Stock</h3>
                <p>When you run out of moves, click the stock to deal one card face-up onto each column.</p>
                <h3>Difficulty</h3>
                <p>One suit: All cards are spades — easiest.<br>
                   Two suits: Cards are spades and hearts.<br>
                   Four suits: All four suits — hardest.</p>
            `,
            onNewGame: () => {
                this.settingsNewGame();
            },
            onRestart: () => {
                this.settingsRestartGame();
            },
        });

        // ─── Init ────────────────────────────────────────────────────────────
        this.settings.apply();
        this.addEventListeners();
        this.registerServiceWorker();
        this.startGame();
    }

    // ─── Game Lifecycle ───────────────────────────────────────────────────────

    startGame() {
        this.gameActive = true;
        this.moveCount  = 0;
        this.updateMovesAndScore();
        //this.stats.recordStart(); //probably not needed
        this.timer.start();

        document.getElementById('win-message').style.display         = 'none';
        document.getElementById('win-stats').style.display           = 'none';
        document.getElementById('middle-btn-new-game').style.display = 'none';

        // ─── Game state ───────────────────────────────────────────────────────
        this.deck        = [];
        this.cardMap     = {};
        this.stock       = [[], [], [], [], []]; // 5
        this.foundations = [[], [], [], [], [], [], [], []]; // 8
        this.tableau     = [[], [], [], [], [], [], [], [], [], []]; // 10
        this.createDeck();
        this.shuffleDeck();
        this.dealCards();
        this.renderDOM();
        console.log('Spider: game started');
    }

    settingsNewGame() {
        if (this.gameActive) this.stats.recordAbandoned();
        this.startGame();
    }

    settingsRestartGame() {
        // TODO just set board state to beginning
    }

    showWinState() {
        this.gameActive = false;
        const timeSecs   = this.timer.getElapsed();
        const finalScore = Math.max(0, 500 - this.moveCount);

        this.timer.stop();

        const flags = this.stats.recordWin({
            moves:    this.moveCount,
            timeSecs: timeSecs,
            score:    finalScore,
        });

        const fmt = s => GameTimer.format(s);
        const s   = this.stats.get();

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
                ${row('Time',   fmt(timeSecs),    fmt(s.bestTime),        flags.isNewBestTime)}
                ${row('Score',  finalScore,        s.bestScore,            flags.isNewBestScore)}
                ${row('Moves',  this.moveCount,    s.bestMoves,            flags.isNewBestMoves)}
                ${row('Streak', s.currentStreak,   s.bestStreak,           flags.isNewBestStreak)}
            </table>`;

        document.getElementById('win-message').style.display         = 'block';
        document.getElementById('win-stats').style.display           = 'block';
        document.getElementById('middle-btn-new-game').style.display = 'flex';
    }

    // ─── Deck ─────────────────────────────────────────────────────────────────

    createDeck() {
        const suit = 'spades'; //currently just easy mode
        for (let index = 0; index < 8; index++) {
            for (const rank of Card.RANKS) {
                const card = new Card(suit, rank, index);
                this.deck.push(card);
                this.cardMap[card.id] = card;
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

    dealCards() {
        // to tableau
        for (let col = 0; col < 10; col++) {
            const numCards = col < 4 ? 6 : 5;
            for (let i = 0; i < numCards; i++) {
                this.tableau[col].push(this.deck.pop());
            }
        }

        // to stock
        for (let resupply = 0; resupply < 5; resupply++) {
            this.stock[resupply].push(this.deck.pop());
        }

        this.deck = [];
    }
    
    // ─── Rendering ────────────────────────────────────────────────────────────

    renderDOM() {
        for (let i = 0; i < 5; i++) {
            const stock = document.getElementById(`stock${i + 1}`);
            stock.innerHTML = '';
            for (const card of this.stock[i]) stock.appendChild(card.element);
        }
        for (let i = 0; i < 8; i++) {
            const found = document.getElementById(`found${i + 1}`);
            found.innerHTML = '';
            for (const card of this.foundations[i]) found.appendChild(card.element);
        }
        for (let i = 0; i < 10; i++) {
            const col = document.getElementById(`col${i + 1}`);
            col.innerHTML = '';
            for (const card of this.tableau[i]) col.appendChild(card.element);
        }

        this.updateSequenceOutlines();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.layout.adjust();
            });
        });
    }

    // ─── Score / Moves ────────────────────────────────────────────────────────

    updateMovesAndScore() {
        document.getElementById('moves').textContent = `Moves: ${this.moveCount}`;
        if (this.settings.get('showScore')) {
            // Spider scoring: 500 - (moveCount * 1) as a simple placeholder
            // TODO: replace with proper Spider scoring formula
            const score = Math.max(0, 500 - this.moveCount);
            document.getElementById('score').textContent = `Score: ${score}`;
        }
    }


    
    // ─── Event Listeners ──────────────────────────────────────────────────────

    addEventListeners() {
        document.addEventListener('click', e => {
            const button = e.target.closest('.top-button');
            if (!button) return;
            switch (button.dataset.action) {
                case 'undo':     this.undo();              break;
                case 'settings': this.settingsUI.open();   break;
            }
        });

        document.getElementById('middle-btn-new-game').addEventListener('click', () => {
            this.startGame();
        });
    }

    // ─── Undo (stub) ──────────────────────────────────────────────────────────

    undo() {
        // TODO: implement undo with history stack
        console.log('Spider: undo');
    }

    // ─── Sequence outlines ────────────────────────────────

    updateSequenceOutlines() {
        // TODO: implement sequence outlines
        console.log('Spider: sequence');
    }

    // ─── Service Worker ───────────────────────────────────────────────────────

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('SW registered'))
                .catch(() => console.log('SW registration failed'));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpiderGame();
});
