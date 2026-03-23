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
- settings menu is too long, bottom not shown
- after win can:
  - move foundation cards, changing score
  - restart and undo
- resetting stats causes lag spike
- stats can be wrong, especially win count
- restarting app required internet connection

### TODO Features
- win animations and deal?

### TODO final refinement
- adjust UI element sizes for all screens and orientations
- better scoring formula using the time

## other games
- spider, with ghost cards after undo
  - create separate html, js, manifest 
  - copy css
  - extract drag/drop handlers, animation code, column spacing, settings into a shared js
- sudoku, with single cell super pencil, number selector with . indicator for remaining, and full color

### Spider proposal
shared/
    StorageManager.js
    SettingsManager.js
    StatsManager.js
    GameTimer.js
    SettingsUI.js
freecell/
    index.html
    manifest.json
    sw.js
    js/
      app.js
      settings-config.js
spider/
    index.html
    manifest.json
    sw.js
    js/
      app.js
      settings-config.js
