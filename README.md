# pwa-cards
card based games

## Freecell PWA
A Progressive Web App for playing Freecell solitaire, optimized for iPad and iPhone.

### Features
- Touch-based card dragging
- PWA installable on devices
- Offline playable

### Setup
1. Run a local server: `python -m http.server 8000` in VS Code terminal
2. Open `http://localhost:8000` in your browser
3. For mobile: Access the IP of your machine on port 8000
4. Use ctrl-shift-R for windows hard refresh

### PWA Installation
- On iOS: Open in Safari, tap share, "Add to Home Screen"
- On Android: Use "Add to Home Screen" from browser menu

### TODO
- Add win detection and game stats
- options button
  - move version to options eventually

### visuals TODO
- less space between columns
  - bigger cards
- dragging cards need to be on top - can be under some newer columns

### controls todo
- automated card move
- tap to move - cycle available slots, cascade first (not to foundation)
- options newgame when not in win or fresh state, so don't accidentally push it
- undo button - unlimited undos to start

### fancy features TODO
- shading on groups in columns - subtle
  - different shading based on how many i can currently move
- number selector to highlight where cards are
  - and suits - but only next 3 for foundations
- dark mode - black background, dark gray cards, red and light gray suits, white buttons
- allow pull from foundations
- when to pwa refresh to new version - new game. Allow new games offline
- face image for face cards JQK
- movement and win animations and deal?
- squish cards when column to long
- stats - games won/lost, streak. Time? score?

### other games
- spider, with ghost cards after undo
- sudoku, with single cell super pencil, number selector with . incicator for remaining, and full color
