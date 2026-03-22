// Spider Solitaire
// Minimal bootstrap — wires up all shared classes.
// Game logic (deck, deal, drag/drop, win) to be added later.

const VERSION = '0.1.0';

class SpiderGame {
    constructor() {
        // ─── Shared: Storage ─────────────────────────────────────────────────
        this.settingsStorage = new StorageManager('spider-settings');
        this.statsStorage    = new StorageManager('spider-stats');

        // ─── Shared: Settings ────────────────────────────────────────────────
        this.settings = new SettingsManager(
            this.settingsStorage,
            {
                darkMode:      false,
                showScore:     true,
                showMoves:     true,
                showTime:      true,
                showNumberBar: true,
                showGrouping:  true,
                difficulty:    1,    // 1 = one suit, 2 = two suits, 4 = four suits
            },
            {
                darkMode:      'dark-mode',
                showScore:     'hide-score',
                showMoves:     'hide-moves',
                showTime:      'hide-time',
                showNumberBar: 'hide-number-bar',
            }
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

        // ─── Shared: Settings UI ─────────────────────────────────────────────
        this.settingsUI = new SettingsUI({
            version:  VERSION,
            settings: this.settings,
            stats:    this.stats,
            toggles: [
                { key: 'showScore',     label: 'Show Score'    },
                { key: 'showMoves',     label: 'Show Moves'    },
                { key: 'showTime',      label: 'Show Timer'    },
                { key: 'showNumberBar', label: 'Show Number Bar' },
                { key: 'darkMode',      label: 'Dark Mode'     },
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
                <p>When you run out of moves, click the stock to deal one card face-up onto each column. You must have at least one card in every column before dealing from the stock.</p>
                <h3>Difficulty</h3>
                <p><strong>One suit:</strong> All cards are spades — easiest.<br>
                   <strong>Two suits:</strong> Cards are spades and hearts.<br>
                   <strong>Four suits:</strong> All four suits — hardest.</p>
            `,
            onNewGame: () => {
                this.stats.recordAbandoned();
                this.resetGame();
            },
            onRestart: () => {
                this.restartGame();
            },
        });

        // ─── Init ────────────────────────────────────────────────────────────
        this.moveCount  = 0;
        this.gameActive = false;

        this.settings.apply();
        this.addEventListeners();
        this.startGame();
    }

    // ─── Game Lifecycle ───────────────────────────────────────────────────────

    startGame() {
        this.moveCount  = 0;
        this.gameActive = true;

        this.updateMovesAndScore();
        this.stats.recordStart();
        this.timer.start();

        // TODO: create deck, shuffle, deal cards to tableau
        console.log('Spider: game started');
    }

    resetGame() {
        this.timer.stop();
        this.gameActive = false;
        this.moveCount  = 0;

        document.getElementById('win-message').style.display         = 'none';
        document.getElementById('win-stats').style.display           = 'none';
        document.getElementById('middle-btn-new-game').style.display = 'none';

        this.startGame();
    }

    restartGame() {
        // TODO: restore initial deal state from history
        // For now, just reset to a new game
        this.resetGame();
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

    // ─── Win ──────────────────────────────────────────────────────────────────

    showWinState() {
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
            this.resetGame();
        });
    }

    // ─── Undo (stub) ──────────────────────────────────────────────────────────

    undo() {
        // TODO: implement undo with history stack
        console.log('Spider: undo');
    }

    // ─── Service Worker ───────────────────────────────────────────────────────

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/spider/sw.js')
                .then(() => console.log('SW registered'))
                .catch(() => console.log('SW registration failed'));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpiderGame();
});
