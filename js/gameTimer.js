// ─── GameTimer ────────────────────────────────────────────────────────────────
//
// Tracks elapsed game time and fires a callback every second with the
// formatted time string. Shared by Freecell and Spider.
//
// Usage:
//   const timer = new GameTimer(elapsed => {
//       document.getElementById('timer').textContent = `Time: ${elapsed}`;
//   });
//
//   timer.start();           // start or restart from zero
//   timer.stop();            // stop ticking (e.g. on win or abandon)
//   timer.getElapsed();      // elapsed seconds as a number
//   GameTimer.format(90);    // "1:30"
//   GameTimer.secsToHMS(90); // "0:01:30"
//   GameTimer.HMSToSecs('0:01:30'); // 90
// ─────────────────────────────────────────────────────────────────────────────

class GameTimer {
    // onTick: function(formattedTime) — called every second with a formatted string
    constructor(onTick) {
        this.onTick       = onTick;
        this.startTime    = null;
        this.interval     = null;
    }

    // Start (or restart) the timer from zero.
    start() {
        this.stop(); // clear any existing interval before starting a new one
        this.startTime = Date.now();
        this.interval  = setInterval(() => {
            this.onTick(GameTimer.format(this.getElapsed()));
        }, 1000);
    }

    // Stop the timer. Elapsed time is still available via getElapsed().
    stop() {
        clearInterval(this.interval);
        this.interval = null;
    }

    // Returns elapsed time in whole seconds, or 0 if never started.
    getElapsed() {
        if (!this.startTime) return 0;
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    // ─── Static formatting utilities ─────────────────────────────────────────
    // Static so they can be used without a timer instance, e.g. when
    // displaying saved best times from stats.

    // Formats seconds as "h:mm:ss" e.g. 90 → "1:30"
    static format(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        } else if (m > 0) {
            return `${m}:${s.toString().padStart(2, '0')}`;
        } else {
            return `${s}`;
        }
    }

    // Formats seconds as "h:mm:ss" e.g. 90 → "0:01:30"
    // Used for the stats edit screen where full precision is needed.
    static secsToHMS(totalSecs) {
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // Parses "h:mm:ss", "m:ss", or raw seconds string back to a number.
    // Returns null if the input is invalid.
    static HMSToSecs(str) {
        const parts = str.split(':').map(p => parseInt(p, 10));
        if (parts.some(isNaN)) return null;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60  + parts[1];
        if (parts.length === 1) return parts[0];
        return null;
    }
}
