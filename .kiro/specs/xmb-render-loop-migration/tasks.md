# XMB Render Loop Migration - Implementation Tasks

## Overview
This implementation plan migrates playback UI state and label rendering from Lit reactive properties to the custom render loop with direct DOM manipulation. The goal is to create a single, consistent rendering model where Lit handles initial structure and the render loop handles all runtime visual updates.

## Tasks

- [x] 1. Migrate XMB render loop to direct DOM manipulation
  - _Requirements: AC1, AC2, AC3, AC4, AC5, AC6_

- [x] 1.1 Add DOM reference caching system
  - Create `domRefs` object to cache frequently updated DOM elements
  - Implement `refreshDOMRefs()` method to update cached references
  - Cache play/pause button SVG paths, progress ring, playhead, and label elements
  - Call `refreshDOMRefs()` in `updated()` lifecycle when `shows` property changes
  - _Requirements: AC4_

- [x] 1.2 Implement playback UI direct manipulation
  - Create `updatePlaybackUI()` method for direct DOM updates
  - Update play/pause icon visibility via `style.display`
  - Update progress ring `stroke-dashoffset` directly
  - Update playhead position (cx, cy attributes) directly
  - Toggle loading state class directly on progress ring
  - Update progress ring and playhead visibility based on playback state
  - _Requirements: AC1, AC3_

- [x] 1.3 Integrate playback UI updates into render loop
  - Call `updatePlaybackUI()` from `_onHighFreqFrame()` method
  - Call `updatePlaybackUI()` from `_onLowFreqFrame()` method
  - Ensure playback UI updates happen alongside existing episode visual updates
  - _Requirements: AC5_

- [x] 1.4 Update template to always render SVG elements
  - Modify template to always render play/pause icons with `display` control
  - Always render progress ring and track with `display` control
  - Always render playhead and hitbox with `display` control
  - Set initial `display: none` on elements that should be hidden
  - Remove conditional rendering (`${condition ? html`...` : ''}`) for SVG elements
  - _Requirements: AC1_

- [x] 1.5 Remove Lit re-renders for playback state changes
  - Remove `@property()` decorators from `isPlaying`, `isLoading`, `playbackProgress`
  - Keep properties as regular class properties (still set by orchestrator)
  - Update `willUpdate()` to call `ensureRenderLoopRunning()` instead of triggering Lit re-renders
  - Verify no `requestUpdate()` calls for playback state changes
  - _Requirements: AC3, AC6_

- [x] 1.6 Implement label direct manipulation
  - Create `updateLabels()` method for direct DOM updates
  - Update label text content directly (check if changed first)
  - Update label positions directly via `style.transform`
  - Update label opacity directly via `style.opacity`
  - Update label colors directly via `style.color`
  - _Requirements: AC2_

- [x] 1.7 Integrate label updates into render loop
  - Call `updateLabels()` from `updateVisuals()` method
  - Remove `labelData` as a reactive property (remove `@property()` decorator)
  - Remove `labelData` comparison and `requestUpdate()` call from `updateVisuals()`
  - Keep `labelData` as internal state for calculations
  - _Requirements: AC2, AC5_

- [x] 1.8 Update label template to always render
  - Modify template to always render label elements
  - Use `style.display` or `style.opacity` to control visibility
  - Remove conditional rendering for labels
  - _Requirements: AC2_
