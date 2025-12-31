# Implementation Plan: XMB Render Loop Refactoring

## Overview

This implementation plan breaks down the XMB render loop refactoring into six independent phases. Each phase is testable and committable separately, following the principle of incremental, verifiable changes. The refactoring optimizes render performance by eliminating unnecessary Lit re-renders while preserving all existing functionality.

## Tasks

- [x] 1. Phase 1: Remove `inlinePlaybackControls` Property
  - Remove the always-true `inlinePlaybackControls` property from XMB browser component
  - Simplify conditional logic that checks this property
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 1.1 Remove property from xmb-browser.ts
  - Remove `@property({ type: Boolean }) inlinePlaybackControls = true;` declaration
  - Remove from JSDoc `@property` documentation
  - Remove `&& this.inlinePlaybackControls` from `willUpdate()` condition
  - Remove `this.inlinePlaybackControls &&` from `_onDragStart()` condition
  - Change `inlinePlaybackControls: this.inlinePlaybackControls` to `inlinePlaybackControls: true` in `updateVisuals()`
  - Remove `&& this.inlinePlaybackControls` from render conditionals
  - _Requirements: 1.1, 1.2_

- [x] 1.2 Remove property from layout-calculator.ts
  - Remove `inlinePlaybackControls: boolean` from `LayoutContext` interface
  - Remove `&& ctx.inlinePlaybackControls` from `calculateEpisodeLayout()`
  - Remove `ctx.inlinePlaybackControls &&` from `calculateOpacity()`
  - _Requirements: 1.3_

- [x] 1.3 Remove property from podcast-player.ts
  - Remove `.inlinePlaybackControls=${true}` from template
  - _Requirements: 1.4_

- [x] 1.4 Verify Phase 1 changes
  - Run full testing checklist (basic functionality, playback, animations, edge cases)
  - Verify app builds without errors
  - Verify play/pause button appears and works
  - Verify progress ring appears during playback
  - Verify dragging is disabled during playback
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 2. Phase 2: Eliminate Runtime Conditional Rendering
  - Remove all conditional rendering based on runtime state
  - Always render elements, control visibility with CSS
  - Implement button reparenting for play/pause button
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 2.1 Always render play/pause button with both icons
  - Remove conditional rendering of button from episode loop
  - Render single button at end of template (outside episode loop) with both play and pause icons
  - Both icons always rendered, visibility controlled by `display` property
  - Initial state: play icon `display: block`, pause icon `display: none`
  - Note: Button will be reparented to current episode in Phase 4 (for now it renders at template location)
  - _Requirements: 2.3, 2.4_

- [x] 2.2 Always render playback titles
  - Remove conditional rendering of playback titles
  - Always render `playback-show-title` and `playback-episode-title` divs
  - Initial state: `opacity: 0`
  - Content will be updated via direct DOM manipulation in Phase 6
  - _Requirements: 2.5_

- [x] 2.3 Always render circular progress SVG
  - Remove conditional rendering of progress SVG
  - Always render the SVG with all child elements (track, progress ring, playhead)
  - Control visibility with opacity
  - Progress values will be updated via direct DOM manipulation in Phase 6
  - _Requirements: 2.6_


- [x] 2.4 Verify only static conditional rendering remains
  - Audit template to ensure conditional rendering only used for static conditions
  - Static conditions: `isEmoji` (icon URL check), `this.config.tracePerformance`
  - No conditional rendering for: navigation state, playback state, runtime visibility
  - _Requirements: 2.7_

- [x] 2.5 Verify Phase 2 changes
  - Run full testing checklist
  - Verify app builds without errors
  - Verify play/pause button appears on center episode
  - Verify button moves with episode during drag
  - Verify play icon shows when paused, pause icon shows when playing
  - Verify no DOM churn during drag (check DevTools Elements panel)
  - Verify only one button element exists in DOM
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 7.1, 7.2, 7.3_

- [x] 3. Phase 3: Eliminate Conditional Rendering for Navigation Labels
  - Stabilize DOM structure for navigation labels
  - Always render labels for each episode/show
  - Update labels via direct DOM manipulation
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 3.1 Always render labels for all episodes and shows
  - Remove conditional rendering of labels based on `labelData.map()`
  - Render labels for each episode in `episodeElements` array
  - Add `data-episode-key` attribute with format `${showIndex}-${episodeIndex}`
  - Render label types: `show-title-label`, `episode-title-label`, `side-episode-title-label`
  - Render `vertical-show-title` for each show with `data-show-index` attribute
  - Initial state: all labels have `opacity: 0`
  - _Requirements: 3.1_

- [x] 3.2 Add updateLabels() method for direct manipulation
  - Create `updateLabels(labelData: LabelData[])` method
  - Query labels by data attributes (e.g., `[data-episode-key="${showIndex}-${episodeIndex}"]`)
  - Update `textContent`, `style.transform`, `style.opacity`, `style.color` directly
  - Use fail-fast approach: crash if label element not found (use `!` operator)
  - _Requirements: 3.2_

- [x] 3.3 Remove requestUpdate() batching from updateVisuals()
  - Remove `needsTemplateUpdate` flag
  - Remove `labelsChanged` detection logic
  - Call `updateLabels(newLabelData)` directly instead of setting reactive property
  - _Requirements: 3.4_

- [x] 3.4 Verify Phase 3 changes
  - Run full testing checklist
  - Verify app builds without errors
  - Verify labels appear correctly during navigation
  - Verify label colors transition correctly (blue → white)
  - Verify side episode titles appear during vertical drag
  - Verify vertical show titles appear during horizontal drag
  - Verify no `requestUpdate()` calls during drag (add console.log to verify)
  - Verify no visual differences from before
  - _Requirements: 3.1, 3.2, 3.4, 7.1_

- [x] 4. Phase 4: Add DOM Reference Cache
  - Cache references to frequently-updated DOM elements
  - Implement button reparenting to current episode
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4.1 Add domRefs property
  - Create `domRefs` object with properties for all frequently-updated elements
  - Include: `playPauseButton`, `playIcon`, `pauseIcon`
  - Include: `progressRing`, `progressTrack`, `playhead`, `playheadHitbox`
  - Include: `playbackShowTitle`, `playbackEpisodeTitle`
  - All properties typed as `HTMLElement | null` or `SVGElement | null`
  - _Requirements: 4.1_

- [x] 4.2 Add refreshDOMRefs() method
  - Create `refreshDOMRefs()` method to populate `domRefs` cache
  - Query all elements using `shadowRoot.querySelector()`
  - Query play/pause button and its child icons
  - Query progress ring elements
  - Query playback title elements
  - _Requirements: 4.1, 4.2_

- [x] 4.3 Add reparentButtonToCurrentEpisode() method
  - Create `reparentButtonToCurrentEpisode()` method
  - Get current show and episode index
  - Find episode element in `episodeElements` array
  - Use fail-fast approach: crash if button or episode element not found (use `!` operator)
  - Call `episodeElement.appendChild(this.domRefs.playPauseButton!)` to move button
  - _Requirements: 4.3, 4.4_

- [x] 4.4 Call refreshDOMRefs() in updated() lifecycle
  - Call `refreshDOMRefs()` in `updated()` after `_cacheElements()`
  - Only call when structure changes (when `shows` array changes)
  - Then call `reparentButtonToCurrentEpisode()` to position button initially
  - _Requirements: 4.2, 4.5_

- [x] 4.5 Call reparentButtonToCurrentEpisode() after navigation
  - Call `reparentButtonToCurrentEpisode()` in `_applySnapTarget()`
  - Call after updating `currentShowIndex` and `currentEpisodeId`
  - This moves button to new center episode after navigation completes
  - _Requirements: 4.5_

- [x] 4.6 Verify Phase 4 changes
  - Run full testing checklist
  - Verify app builds without errors
  - Verify button is correctly parented to center episode on load
  - Verify button moves to new episode after navigation
  - Verify DOM refs are populated correctly (add console.log to verify)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2_


- [x] 5. Phase 5: Convert Playback State to Manual Getters/Setters
  - Convert reactive properties to manual getters/setters
  - Maintain correct render loop mode switching
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 5.1 Replace isPlaying with manual property
  - Remove `@property({ type: Boolean }) isPlaying = false;`
  - Add private field: `private _isPlaying = false;`
  - Add getter: `get isPlaying(): boolean { return this._isPlaying; }`
  - Add setter that calls `_handlePlaybackStateChange()` and `_updateRenderLoopStrategy()`
  - Setter must only call handlers if value actually changed
  - _Requirements: 5.1, 5.6_

- [x] 5.2 Replace isLoading with manual property
  - Remove `@property({ type: Boolean }) isLoading = false;`
  - Add private field: `private _isLoading = false;`
  - Add getter: `get isLoading(): boolean { return this._isLoading; }`
  - Add setter that calls `_handlePlaybackStateChange()` and `_updateRenderLoopStrategy()`
  - Setter must only call handlers if value actually changed
  - _Requirements: 5.2, 5.6_

- [x] 5.3 Replace playbackProgress with manual property
  - Remove `@property({ type: Number }) playbackProgress = 0;`
  - Add private field: `private _playbackProgress = 0;`
  - Add getter: `get playbackProgress(): number { return this._playbackProgress; }`
  - Add setter that only updates internal state (no handlers, no re-render)
  - _Requirements: 5.3, 5.6_

- [x] 5.4 Add _updateRenderLoopStrategy() helper method
  - Create `_updateRenderLoopStrategy()` method
  - Call `renderLoopController.updateStrategy()` with current state
  - Pass: `isDragging()`, `isMomentumActive()`, `isSnapping()`, `hasActiveAnimations()`, `isPlaying`
  - This maintains correct render loop mode switching after property changes
  - _Requirements: 5.4, 8.4_

- [x] 5.5 Extract playback state change logic to _handlePlaybackStateChange()
  - Create `_handlePlaybackStateChange(oldIsPlaying: boolean, oldIsLoading: boolean)` method
  - Move animation triggering logic from `willUpdate()` to this method
  - Handle transitions: paused→active, active→paused, loading→playing
  - _Requirements: 5.5_

- [x] 5.6 Update willUpdate() to remove playback state handling
  - Remove `isPlaying` and `isLoading` change detection from `willUpdate()`
  - Keep only `config` handling in `willUpdate()`
  - Playback state changes now handled by setters
  - _Requirements: 5.1, 5.2_

- [x] 5.7 Verify Phase 5 changes
  - Run full testing checklist
  - Verify app builds without errors
  - Verify play/pause transitions trigger animations
  - Verify loading state shows spinner animation
  - Verify progress updates don't cause full re-renders (check console for requestUpdate calls)
  - Verify render loop switches to low-freq during steady playback
  - Verify render loop switches to idle when paused and no animations
  - Verify console shows correct mode transitions (enable `tracePerformance` in config)
  - Test all mode switching scenarios from design document
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.2, 7.3, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 6. Phase 6: Direct DOM Manipulation for Playback UI
  - Update playback UI elements directly without Lit re-renders
  - Implement updatePlaybackUI() method
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 6.1 Add updatePlaybackUI() method
  - Create `updatePlaybackUI()` method
  - Update progress ring `stroke-dashoffset` based on `playbackProgress`
  - Calculate: `circumference = 2 * Math.PI * XMB_COMPUTED.progressRadius`
  - Calculate: `offset = circumference * (1 - this.playbackProgress)`
  - Use fail-fast approach: crash if `progressRing` is null (use `!` operator)
  - _Requirements: 6.1_

- [x] 6.2 Update playhead position in updatePlaybackUI()
  - Calculate playhead position based on `playbackProgress`
  - Show playhead only when `isPlaying && progress > 0`
  - Calculate angle: `progress * 2 * Math.PI - Math.PI / 2`
  - Calculate x/y coordinates on circle
  - Update `cx` and `cy` attributes via `setAttribute()`
  - Update both `playhead` and `playheadHitbox` elements
  - Use fail-fast approach: crash if elements are null
  - _Requirements: 6.2_

- [x] 6.3 Update play/pause icon visibility in updatePlaybackUI()
  - Toggle icon visibility based on `isPlaying` state
  - Play icon: `display: block` when paused, `display: none` when playing
  - Pause icon: `display: none` when paused, `display: block` when playing
  - Use fail-fast approach: crash if icons are null
  - _Requirements: 6.3_

- [x] 6.4 Update loading state in updatePlaybackUI()
  - Add/remove `loading` class on progress track based on `isLoading` state
  - Use `classList.add('loading')` when loading
  - Use `classList.remove('loading')` when not loading
  - Use fail-fast approach: crash if track is null
  - _Requirements: 6.4_

- [x] 6.5 Update play/pause button transform in updateVisuals()
  - Update button `transform` and `opacity` styles based on `buttonScale`
  - Clamp scale: `clampedScale = buttonScale < 0.01 ? 0 : buttonScale`
  - Set transform: `translateZ(0) scale(${XMB_CONFIG.maxZoom})`
  - Set opacity: `clampedScale.toString()`
  - Set pointer-events: `'auto'` if scale > 0, else `'none'`
  - Use fail-fast approach: crash if button is null
  - _Requirements: 6.5_

- [x] 6.6 Call updatePlaybackUI() from _onLowFreqFrame()
  - Add call to `updatePlaybackUI()` in `_onLowFreqFrame()` method
  - Call after `updateVisuals()`
  - This ensures playback UI updates at 15fps during playback
  - _Requirements: 6.6_

- [x] 6.7 Update playback title text content in updateVisuals()
  - Add code to update `playbackShowTitle.textContent` with current show title
  - Add code to update `playbackEpisodeTitle.textContent` with current episode title
  - Get current show from `this.shows[this.currentShowIndex]`
  - Get current episode from `currentShow.episodes[currentEpisodeIndex]`
  - Use fail-fast approach: crash if title elements are null
  - _Requirements: 2.5_

- [x] 6.8 Simplify render() template for progress elements
  - Remove dynamic style calculations from progress ring template
  - Use initial/default values for stroke-dashoffset
  - Let direct DOM manipulation handle runtime updates
  - _Requirements: 6.1, 6.2_

- [x] 6.9 Verify Phase 6 changes
  - Run full testing checklist
  - Verify app builds without errors
  - Verify progress ring updates smoothly during playback
  - Verify playhead moves correctly around ring
  - Verify play/pause button appears on center episode
  - Verify button moves with episode during drag (inherits transform from parent)
  - Verify play/pause icon toggles correctly
  - Verify loading spinner appears on track
  - Verify playback titles show correct show/episode names
  - Verify performance improved (fewer Lit re-renders - check console)
  - _Requirements: 2.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 7. Final Verification and Performance Testing
  - Verify all success metrics achieved
  - Run comprehensive regression testing
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 7.1 Verify no Lit re-renders during playback
  - Add console.log to track `requestUpdate()` calls
  - Start playback and let it run for 10 seconds
  - Verify zero `requestUpdate()` calls during steady-state playback
  - _Requirements: 6.6_

- [x] 7.2 Verify animation performance
  - Use browser DevTools Performance tab
  - Record during navigation (drag, momentum, snap)
  - Verify 60fps during high-frequency animations
  - Record during playback
  - Verify 15fps during low-frequency playback updates
  - _Requirements: 7.8_

- [x] 7.3 Verify no SVG blurriness
  - Visually inspect play/pause button during animations
  - Visually inspect progress ring during playback
  - Verify no blurriness or pixelation
  - _Requirements: 7.8_

- [x] 7.4 Run complete regression test suite
  - Test all basic functionality (app loads, shows display, navigation works)
  - Test all playback features (play, pause, progress, auto-advance, seeking)
  - Test all animations (play button fade, radial push, drag momentum, snap)
  - Test all edge cases (rapid toggling, loading state, tab visibility)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

## Notes

- Each phase is a separate commit for easy rollback
- Run the testing checklist after each phase before proceeding
- If any phase introduces issues, revert the commit, fix, and re-apply
- Enable `tracePerformance` in config to see render loop mode transitions
- Use browser DevTools to verify DOM structure and performance
- The fail-fast approach means bugs will be obvious - this is intentional
