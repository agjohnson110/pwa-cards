# pwa-cards
card based games

## Freecell PWA
A Progressive Web App for installable, offline Freecell solitaire, optimized for iPad and iPhone.

### Test Setup
1. Run a local server: `python -m http.server 8000` in VS Code terminal
2. Open `http://localhost:8000` in your browser
3. For mobile: Access the IP of your machine on port 8000
4. Use ctrl-shift-R for windows hard refresh

### PWA Installation
- On iOS: Open in Safari, tap share, "Add to Home Screen"
- On Android: Use "Add to Home Screen" from browser menu

### TODO

### visuals TODO

### controls todo
- options
  - newgame 
  - restart
  - version


### fancy features TODO
- shading on groups in columns - subtle
  - different shading based on how many i can currently move
- dark mode - black background, dark gray cards, red and light gray suits, light gray buttons
- allow pull from foundations
- when to pwa refresh to new version - new game. Allow new games offline
- face image for face cards JQK
- win animations and deal?
- squish cards when column to long
- stats - games won/lost, streak. Time? score?

## other games
- spider, with ghost cards after undo
- sudoku, with single cell super pencil, number selector with . indicator for remaining, and full color
