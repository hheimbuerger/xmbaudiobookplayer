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
[ ] typography of labels
[x] tweak the momentum system
[ ] Episode artwork loading states / placeholders, and loading animation during catalog initialization
[x] tweak the episode badges
[ ] "podcast" -> "audiobook"
[x] support different catalogs via configuration
[x] implement archive.org-based demo catalog: https://archive.org/details/adventures_holmes/, https://archive.org/details/alices_adventures_1003
[ ] Refactor: Move isPlaying, isLoading, playbackProgress, and labelData out of Lit's reactive system into the custom render loop -- see section below

# Release tasks

[.] select favicon and name
[x] write README
[x] add license
[x] add demo screencast/gif
[x] publish to GitHub

## Future Enhancements

[ ] optimize performance of low-powered devices (like the ThinkSmart View)
[ ] Unify episode selection persistence (currently in localStorage) and episode playhead persistence (currently in ABS) -- the split is pretty awkward, and probably doesn't transfer well to alternative media repositories
[ ] Show duration and remaining time of playing episode. Use case: "dinner is ready!" - "Give me X minutes!". Should be on-demand (to decrease visual attention demand)
[ ] HA card build?
[ ] Haptic feedback on touch devices, e.g. when snapping, scrubbing
[ ] allow setting a general zoom level or zooming the browser

---

# What's Still Animated Through Lit vs. Custom Render Loop

## **Handled by Custom Render Loop** (Direct DOM manipulation via `updateVisuals()`):
1. **Episode icon positions** - `transform: translate()` and `scale()`
2. **Episode icon opacity**
3. **Play/pause button scale/opacity** - Animated by AnimationController
4. **All drag, momentum, and snap animations** - Position offsets applied directly to DOM

## **Still Handled by Lit's Reactive System** (Triggers full re-renders):

### **Properties that trigger re-renders:**
1. **`shows`** - Array of shows/episodes (structural changes)
2. **`inlinePlaybackControls`** - Boolean flag
3. **`isPlaying`** - Playback state (changes play/pause icon)
4. **`isLoading`** - Loading state (adds loading class to progress ring)
5. **`playbackProgress`** - Progress value (0-1)
6. **`config`** - Player configuration object

### **What gets re-rendered when these change:**

**When `isPlaying` or `isLoading` changes:**
- Play/pause button SVG icon (switches between play triangle and pause bars)
- Progress ring visibility (`display: block/none`)
- Playhead circle visibility (`display: block/none`)
- Playhead hitbox visibility (`display: block/none`)
- Loading animation class on progress track

**When `playbackProgress` changes:**
- Progress ring `stroke-dashoffset` calculation
- Playhead position (x/y coordinates)

**When `shows` changes:**
- Entire episode grid structure (all episode divs)
- All icons and badges

**When `inlinePlaybackControls` changes:**
- Conditional rendering of play/pause button
- Conditional rendering of circular progress
- Conditional rendering of playback titles

**Special case - `labelData`:**
- This is a private property that triggers `requestUpdate()` manually
- Contains all label positions, opacities, and colors
- Updated during `updateVisuals()` but causes Lit re-render for label DOM

## **Performance Impact:**

The main Lit re-renders happen for:
1. **Structural changes** (`shows` array) - rare, acceptable
2. **Playback state changes** (`isPlaying`, `isLoading`) - infrequent, small DOM changes
3. **Progress updates** (`playbackProgress`) - **This is the potential issue** if it updates frequently
4. **Label updates** (`labelData`) - Happens during animations, but batched with `pendingUpdate` flag

## **Potential Optimization:**

The **`playbackProgress`** property could be moved to direct DOM manipulation if it updates frequently (e.g., every frame during playback). Currently it triggers a Lit re-render to update the progress ring and playhead position, which could be done via direct style manipulation instead.

## **TODO:**

Move playback state (isPlaying, isLoading, playbackProgress) and labelData from Lit reactive properties to render loop with direct DOM manipulation
