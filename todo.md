# Next Actions

[x] review xmb-architecture and xmb-orchestration
[x] fix lingering UI issues
[x] very blurry play icon on desktop (px=dpx?) only
[x] significant stutter when switching to the show with ~50 episodes -- FIXED: `currentShowIndex` was `@state()` causing full Lit re-renders
[x] review render() vs. _render()
[.] look for further slimming of xmb-browser.ts
[ ] consider extracting constants/configuration from xmb-browser.ts
[ ] consider extracting css from xmb-browser.ts

# v1.0

[x] lock down UI while seeking/loading
[x] add show and episode labels
[x] transition to Lit
[x] integrate with audiobookshelf
[x] add scrobber and audio player
[x] experiment with 2.0 scaler
[x] clean up console logs and fix some runtime warnings (CORS, Lit change-in-update)
[.] refactor huge xmb component into smaller aspects
[ ] optimize render loop being always active and constantly blocking one CPU core
[ ] typography of labels
[ ] add a dummy provider for standalone demo
[ ] add support for separate episode artwork (not single album art for entire show)
[ ] optimize performance of low-powered devices (like the ThinkSmart)

# Release tasks

[ ] select favicon and name
[ ] write README
[ ] add license
[ ] add demo screencast/gif
[ ] publish to GitHub

## Future Enhancements

[ ] transition to HA card
[ ] Unify episode selection persistence (currently in localStorage) and episode playhead persistence (currently in ABS) -- the split is pretty awkward, and probably doesn't transfer well to alternative media repositories
[ ] Show duration and remaining time of playing episode. Use case: "dinner is ready!" - "Give me X minutes!". Should be on-demand (to decrease visual attention demand)
[ ] Haptic feedback on touch devices, e.g. when snapping, scrubbing
[ ] Episode artwork loading states / placeholders, and loading animation during catalog initialization
