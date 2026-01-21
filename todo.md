# Next Actions

[x] review xmb-architecture and xmb-orchestration
[x] fix lingering UI issues
[x] very blurry play icon on desktop (px=dpx?) only
[x] significant stutter when switching to the show with ~50 episodes -- FIXED: `currentShowIndex` was `@state()` causing full Lit re-renders
[x] review render() vs. _render()
[x] look for further slimming of xmb-browser.ts
[x] consider extracting constants/configuration from xmb-browser.ts
[x] consider extracting css from xmb-browser.ts

# v1.0

[x] lock down UI while seeking/loading
[x] add show and episode labels
[x] transition to Lit
[x] integrate with audiobookshelf
[x] add scrobber and audio player
[x] experiment with 2.0 scaler
[x] clean up console logs and fix some runtime warnings (CORS, Lit change-in-update)
[x] refactor huge xmb component into smaller aspects
[x] optimize render loop being always active and constantly blocking one CPU core
[x] add a dummy provider for standalone demo
[x] add support for separate episode artwork (not single album art for entire show)
[x] tweak the momentum system
[x] tweak the episode badges
[x] support different catalogs via configuration
[x] implement archive.org-based demo catalog: https://archive.org/details/adventures_holmes/, https://archive.org/details/alices_adventures_1003
[x] Refactor: Move isPlaying, isLoading, playbackProgress, and labelData out of Lit's reactive system into the custom render loop -- see section below
[ ] Support media keys (currently switching the playback, but not updating the visuals, e.g. switching between playback and browse mode)
[ ] typography of labels
[ ] test running playback in the background
[ ] "podcast" -> "audiobook"
[ ] Episode artwork loading states / placeholders, and loading animation during catalog initialization

# Release tasks

[.] select favicon and name
[x] write README
[x] add license
[x] add demo screencast/gif
[x] publish to GitHub

## Future Enhancements

[x] optimize performance of low-powered devices (like the ThinkSmart View)
[ ] Show duration and remaining time of playing episode. Use case: "dinner is ready!" - "Give me X minutes!". Should be on-demand (to decrease visual attention demand)
[ ] HA card build?
[ ] Haptic feedback on touch devices, e.g. when snapping, scrubbing
[ ] allow setting a general zoom level or zooming the browser
