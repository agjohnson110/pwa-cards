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

### Versioning
- edit both .js files

### TODO Bugs
+ undo breaks z-position of some tableau cards
+ restarting app required internet connection
- squish cards when column is to long

### TODO Features
- face image for face cards JQK
- win animations and deal?
- License statement in code. GNU?
- disable undo/restart at game win
- display some stats at game win (current vs best time/score/moves, totals)

### TODO settings page
- stats import
- share this qr code page
- rules
- maybe help icons for some settings
- maybe debug mode (ignore card placement rules)

### TODO final refinement
- adjust UI element sizes for all screens and orientations
- better scoring formula using the time


## other games
- spider, with ghost cards after undo
- sudoku, with single cell super pencil, number selector with . indicator for remaining, and full color
