# pwa-cards
card based games

## Freecell PWA
A Progressive Web App for installable, offline Freecell solitaire, optimized for iPad and iPhone.

### Test Setup
1. Run a local server in root directory: `python -m http.server 8000` in VS Code terminal
2. Open `http://localhost:8000` in your browser
3. For mobile: Access the IP of your machine on port 8000
4. Use ctrl-shift-R for windows hard refresh

### PWA Installation
- On iOS: Open in Safari, tap share, "Add to Home Screen"
- On Android: Use "Add to Home Screen" from browser menu

### Versioning
- edit both .js files

### TODO Bugs
- settings menu is too long, bottom not shown - works in Spider
- after win can:
  - move foundation cards, changing score
  - restart and undo
- resetting stats causes lag spike - might be fixed
- stats can be wrong, especially win count - might be fixed
- restarting app required internet connection

### TODO Features
- win animations and deal?

### TODO final refinement
- adjust UI element sizes for all screens and orientations
- better scoring formula using the time

## other games
- sudoku, with single cell super pencil, number selector with . indicator for remaining, and full color

### Spider PWA
- spider, with ghost cards after undo
  - copy css
