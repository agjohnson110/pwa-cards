// ─── StatsManager ─────────────────────────────────────────────────────────────
//
// Tracks and persists game statistics. Shared by Freecell and Spider.
// Each game passes its own StorageManager instance and default stats shape,
// so the storage key and stat fields stay game-specific.
//
// Usage:
//   const storage = new StorageManager('freecell-stats');
//   const stats   = new StatsManager(storage, {
//       gamesPlayed: 0, gamesWon: 0, bestMoves: null, bestTime: null,
//       bestScore: null, currentStreak: 0, bestStreak: 0,
//       totalMoves: 0, totalTime: 0, totalScore: 0,
//   });
//
//   stats.recordStart();
//   stats.recordWin({ moves: 42, timeSecs: 180, score: 478 });
//   stats.recordAbandoned();
//   stats.reset();
//   stats.get();      // returns current stats object
//   stats.set(obj);   // overwrite stats (e.g. from the edit stats screen)
// ─────────────────────────────────────────────────────────────────────────────

class StatsManager {
    // storage:  a StorageManager instance (handles the localStorage key)
    // defaults: plain object with all stat fields and their initial values.
    //           null means "no win yet" for best-tracking fields.
    constructor(storage, defaults) {
        this.storage  = storage;
        this.defaults = defaults;
        this.data     = this.storage.load(defaults);
    }

    // Returns a copy of the current stats object.
    get() {
        return { ...this.data };
    }

    // Overwrites stats entirely — used by the edit stats screen.
    set(obj) {
        this.data = { ...obj };
        this.storage.save(this.data);
    }

    // Resets all stats back to defaults and persists.
    reset() {
        this.data = { ...this.defaults };
        this.storage.save(this.data);
    }

    // Call when a new game starts.
    recordStart() {
        this.storage.save(this.data);
    }

    // Call when the player wins.
    // { moves, timeSecs, score } are passed in by the game since the
    // scoring formula differs between Freecell and Spider.
    // Returns an object flagging which stats are new bests, so the
    // win screen can highlight them without recalculating.
    recordWin({ moves, timeSecs, score }) {
        const prev = this.get(); // snapshot before updating

        this.data.gamesPlayed++;
        this.data.gamesWon++;
        this.data.currentStreak++;
        this.data.bestStreak = Math.max(this.data.bestStreak, this.data.currentStreak);

        this.data.bestMoves = prev.bestMoves === null ? moves    : Math.min(prev.bestMoves, moves);
        this.data.bestTime  = prev.bestTime  === null ? timeSecs : Math.min(prev.bestTime,  timeSecs);
        this.data.bestScore = prev.bestScore === null ? score    : Math.max(prev.bestScore, score);

        this.data.totalMoves += moves;
        this.data.totalTime  += timeSecs;
        this.data.totalScore += score;

        this.storage.save(this.data);

        // Return which fields are new bests so the win screen can highlight them
        return {
            isNewBestMoves:  prev.bestMoves  === null || moves    < prev.bestMoves,
            isNewBestTime:   prev.bestTime   === null || timeSecs < prev.bestTime,
            isNewBestScore:  prev.bestScore  === null || score    > prev.bestScore,
            isNewBestStreak: prev.bestStreak === null || this.data.currentStreak > prev.bestStreak,
        };
    }

    // Call when a game is abandoned (new game, etc.)
    recordAbandoned() {
        this.data.gamesPlayed++;
        this.data.currentStreak = 0;
        this.storage.save(this.data);
    }
}
