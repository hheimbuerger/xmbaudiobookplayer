# Design Document: XMB Render Loop Refactoring

## Overview

This design describes a systematic refactoring of the XMB browser component to optimize render performance by eliminating unnecessary Lit re-renders during playback and animations. The refactoring uses direct DOM manipulation for frequently-updated elements while preserving all existing functionality and user experience.

The optimization is structured as six independent phases, each testable and committable separately, following the principle of incremental, verifiable changes.

## Architecture

### Current Architecture Problems

The XMB browser currently uses Lit's reactive property system (`@property` decorator) for all state management. This causes performance issues:

1. **Frequent re-renders**: Properties like `isPlaying`, `isLoading`, `playbackProgress` change frequently (15-60 times per second), triggering full component re-renders
2. **Conditional rendering churn**: Runtime conditions like `${isPlaying ? html\`...\` : ''}` create/destroy DOM elements on every state change
3. **SVG namespace issues**: Conditionally rendered SVG elements are created in the wrong namespace, causing rendering failures
4. **Inability to cache references**: Conditional rendering prevents caching DOM element references for direct manipulation

### Target Architecture

The refactored architecture separates concerns:

1. **Static structure**: Template defines a stable DOM structure that rarely changes
2. **Direct manipulation**: Frequently-updated elements (progress ring, playhead, labels) are updated via cached DOM references
3. **Manual properties**: High-frequency state (`isPlaying`, `isLoading`, `playbackProgress`) uses manual getters/setters that don't trigger re-renders
4. **Preserved reactivity**: Low-frequency state (shows array, config) remains reactive for automatic updates

### Render Loop Architecture

The `RenderLoopController` manages three modes:

| Mode | Implementation | FPS | When Used |
|------|---------------|-----|-----------|
| `idle` | No loop | 0 | Nothing to update |
| `high-freq` | `requestAnimationFrame` | 60 | Drag, momentum, snap, animations |
| `low-freq` | `setInterval` | 15 | Playback progress updates |


**Mode switching logic:**
```
needsHighFreq = isDragging || isMomentumActive || isSnapping || hasActiveAnimations
needsLowFreq = isPlaying && tabVisible

if (needsHighFreq) → high-freq
else if (needsLowFreq) → low-freq  
else → idle
```

**Critical invariant:** When playback state or animation state changes, `updateStrategy()` must be called with accurate state. Currently this happens via `willUpdate()` reacting to `@property` changes. After converting to manual setters, the setters must call `updateStrategy()`.

## Components and Interfaces

### DOM Reference Cache

```typescript
interface DOMRefs {
  // Play/pause button (single element, reparented to current episode)
  playPauseButton: HTMLElement | null;
  playIcon: SVGElement | null;
  pauseIcon: SVGElement | null;
  
  // Progress ring elements (single instances)
  progressRing: SVGCircleElement | null;
  progressTrack: SVGCircleElement | null;
  playhead: SVGCircleElement | null;
  playheadHitbox: SVGCircleElement | null;
  
  // Playback titles (single instances)
  playbackShowTitle: HTMLElement | null;
  playbackEpisodeTitle: HTMLElement | null;
}
```

Note: Label elements are NOT cached since they're queried by data attributes as needed.

### Manual Property Pattern

```typescript
// Replace reactive property:
// @property({ type: Boolean }) isPlaying = false;

// With manual getter/setter:
private _isPlaying = false;

get isPlaying(): boolean { 
  return this._isPlaying; 
}

set isPlaying(value: boolean) {
  const oldValue = this._isPlaying;
  this._isPlaying = value;
  if (oldValue !== value) {
    this._handlePlaybackStateChange(oldValue, this._isLoading);
    this._updateRenderLoopStrategy();
  }
}
```


### Label Update Pattern

Instead of dynamically rendering labels based on `labelData.map()`, always render labels for all episodes and update them directly:

```typescript
// Template: Render labels for each episode
${this.episodeElements.map(ep => html`
  <div class="episode-label show-title-label" 
       data-episode-key="${ep.showIndex}-${ep.episodeIndex}"
       style="opacity: 0"></div>
  <div class="episode-label episode-title-label" 
       data-episode-key="${ep.showIndex}-${ep.episodeIndex}"
       style="opacity: 0"></div>
  <div class="episode-label side-episode-title-label" 
       data-episode-key="${ep.showIndex}-${ep.episodeIndex}"
       style="opacity: 0"></div>
`)}

${this.shows.map((show, showIndex) => html`
  <div class="vertical-show-title" 
       data-show-index="${showIndex}"
       style="opacity: 0"></div>
`)}

// Update method: Update labels directly via selectors
private updateLabels(labelData: LabelData[]): void {
  labelData.forEach(label => {
    const selector = label.type === 'vertical-show' 
      ? `.vertical-show-title[data-show-index="${label.showIndex}"]`
      : `.${label.className}[data-episode-key="${label.showIndex}-${label.episodeIndex}"]`;
    
    const element = this.shadowRoot!.querySelector(selector) as HTMLElement;
    element.textContent = label.text;
    element.style.transform = label.transform;
    element.style.opacity = label.opacity.toString();
    element.style.color = label.color;
  });
}
```

**Benefits:**
- Much simpler than pool management
- Labels are tied to episodes (clearer relationship)
- Still avoids conditional rendering
- Still avoids `requestUpdate()` calls
- No complex pool sizing or overflow handling

### Button Reparenting Pattern

The play/pause button must move with the current center episode during drag. Instead of conditionally rendering a button inside each episode (causing DOM churn), render a single button and reparent it:

```typescript
// Template: Single button rendered once
<div class="play-pause-overlay" @click=${this._handlePlayPauseClick}>
  <svg class="play-icon" viewBox="0 0 24 24" style="display: block">
    <path d="M8 5v14l11-7z"/>
  </svg>
  <svg class="pause-icon" viewBox="0 0 24 24" style="display: none">
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
  </svg>
</div>

// Reparenting: Move button to current episode
private reparentButtonToCurrentEpisode(): void {
  if (!this.domRefs.playPauseButton) return;
  
  const currentShow = this.shows[this.currentShowIndex];
  if (!currentShow) return;
  
  const currentEpisodeIndex = this._getCurrentEpisodeIndex(currentShow);
  const episodeElement = this.episodeElements.find(
    e => e.showIndex === this.currentShowIndex && 
         e.episodeIndex === currentEpisodeIndex
  )?.element;
  
  if (episodeElement) {
    episodeElement.appendChild(this.domRefs.playPauseButton);
  }
}
```

**Key insight:** `appendChild()` of an existing element MOVES it (doesn't clone). The button inherits the episode's transform and moves with it during drag.


## Data Models

### Phase Execution Model

Each phase is independent and follows this pattern:

1. **Identify**: Determine which reactive properties or conditional rendering to eliminate
2. **Refactor**: Convert to direct DOM manipulation or manual properties
3. **Verify**: Run comprehensive testing checklist
4. **Commit**: Create a separate commit for rollback capability

### Phase Dependencies

```
Phase 1 (Remove property) → Phase 2 (Eliminate conditionals)
                                ↓
Phase 3 (Label pools) ← Phase 4 (DOM cache) → Phase 5 (Manual properties)
                                                      ↓
                                                Phase 6 (Direct manipulation)
```

Phases 1-2 must be sequential. Phases 3-5 can be done in any order. Phase 6 depends on phases 4-5.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Since this is a refactoring project focused on preserving existing behavior while improving performance, the correctness properties are primarily regression tests that verify no functionality is lost. All acceptance criteria are testable as specific examples that verify the refactoring maintains existing behavior.

### Phase 1 Properties

**Example 1: Property removal compiles**
After removing `inlinePlaybackControls` property, the TypeScript compiler should complete without errors.
**Validates: Requirements 1.1**

**Example 2: Controls always inline**
Playback controls should always render inline without checking a property value.
**Validates: Requirements 1.2**

**Example 3: Layout assumes inline**
Layout calculator should not have conditional logic for `inlinePlaybackControls`.
**Validates: Requirements 1.3**

**Example 4: No attribute passed**
Component instantiation in `podcast-player.ts` should not pass `inlinePlaybackControls` attribute.
**Validates: Requirements 1.4**

### Phase 2 Properties

**Example 5: Runtime elements always rendered**
Elements whose visibility depends on runtime state (navigation, playback) should always exist in the DOM.
**Validates: Requirements 2.1**

**Example 6: Visibility via CSS**
Element visibility changes should update CSS properties (`display`, `opacity`, `visibility`) directly, not via template re-renders.
**Validates: Requirements 2.2**

**Example 7: Single button element**
Exactly one play/pause button element should exist in the DOM, reparented to the current center episode.
**Validates: Requirements 2.3**

**Example 8: Both icons exist**
Both play and pause icons should always exist in the DOM with visibility controlled by `display` property.
**Validates: Requirements 2.4**


**Example 9: Playback titles always exist**
Playback title elements should always exist in the DOM with content updated via direct DOM manipulation.
**Validates: Requirements 2.5**

**Example 10: Progress SVG always exists**
Circular progress SVG should always exist in the DOM with visibility controlled by opacity.
**Validates: Requirements 2.6**

**Example 11: Only static conditionals**
Conditional rendering should only be used for static conditions (config values, data structure checks).
**Validates: Requirements 2.7**

### Phase 3 Properties

**Example 12: Labels always rendered**
Navigation labels should always exist in the DOM for each episode/show, with visibility controlled by opacity.
**Validates: Requirements 3.1**

**Example 13: Labels via direct manipulation**
Label content updates should happen via direct DOM manipulation without calling `requestUpdate()`.
**Validates: Requirements 3.2, 3.4**

**Example 14: Labels tied to episodes**
Each label element should have a data attribute tying it to a specific episode or show.
**Validates: Requirements 3.1**

### Phase 4 Properties

**Example 15: DOM refs cached**
After rendering, `domRefs` object should contain references to all frequently-updated DOM elements.
**Validates: Requirements 4.1**

**Example 16: Refs refreshed on structure change**
When DOM structure changes, `refreshDOMRefs()` should be called to update cached references.
**Validates: Requirements 4.2**

**Example 17: Button reparented**
After navigation completes, play/pause button should be a child of the current center episode element.
**Validates: Requirements 4.3, 4.5**

**Example 18: Null checks present**
All code accessing cached DOM references should include null checks before use.
**Validates: Requirements 4.4**

### Phase 5 Properties

**Example 19: isPlaying setter updates strategy**
When `isPlaying` changes, the setter should call `_updateRenderLoopStrategy()`.
**Validates: Requirements 5.1**

**Example 20: isLoading setter updates strategy**
When `isLoading` changes, the setter should call `_updateRenderLoopStrategy()`.
**Validates: Requirements 5.2**

**Example 21: playbackProgress setter no re-render**
When `playbackProgress` changes, the setter should not call `requestUpdate()`.
**Validates: Requirements 5.3**


**Example 22: Render loop mode switching**
Render loop should switch to correct mode (idle/low-freq/high-freq) when playback state changes.
**Validates: Requirements 5.4, 8.1, 8.2, 8.3, 8.4**

**Example 23: Animations trigger on transitions**
Play/pause transitions should trigger appropriate animations via state change handlers.
**Validates: Requirements 5.5**

**Example 24: Getters return current values**
Calling `isPlaying`, `isLoading`, or `playbackProgress` getters should return current internal state.
**Validates: Requirements 5.6**

### Phase 6 Properties

**Example 25: Progress ring updates directly**
During playback, progress ring `stroke-dashoffset` should be updated via direct DOM manipulation.
**Validates: Requirements 6.1**

**Example 26: Playhead position updates directly**
During playback, playhead `cx` and `cy` attributes should be updated via direct DOM manipulation.
**Validates: Requirements 6.2**

**Example 27: Icon visibility toggled directly**
When playback state changes, play/pause icon `display` property should be toggled directly.
**Validates: Requirements 6.3**

**Example 28: Loading class toggled directly**
When loading state changes, progress track `loading` class should be added/removed directly.
**Validates: Requirements 6.4**

**Example 29: Button transform updated directly**
When button scale changes, button `transform` and `opacity` styles should be updated directly.
**Validates: Requirements 6.5**

**Example 30: Low-freq updates no re-render**
During low-frequency render loop execution, playback UI updates should not call `requestUpdate()`.
**Validates: Requirements 6.6**

### Regression Test Properties

**Example 31: Navigation preserved**
Horizontal and vertical navigation with drag, momentum, and snap animations should work identically to before.
**Validates: Requirements 7.1**

**Example 32: Playback preserved**
Clicking play should start playback with progress ring appearing and filling.
**Validates: Requirements 7.2**

**Example 33: Pause preserved**
Clicking pause should stop playback and show play icon.
**Validates: Requirements 7.3**

**Example 34: Auto-advance preserved**
When playback reaches the end, auto-advance to next episode should work correctly.
**Validates: Requirements 7.4**

**Example 35: Seeking preserved**
Dragging the playhead should seek to the correct position.
**Validates: Requirements 7.5**


**Example 36: Loading state preserved**
When loading state is active, spinner animation should appear on progress track.
**Validates: Requirements 7.6**

**Example 37: Rapid toggling handled**
Rapid play/pause toggling should not cause errors or crashes.
**Validates: Requirements 7.7**

**Example 38: Render loop transitions**
After high-freq animations complete, render loop should transition to appropriate next mode.
**Validates: Requirements 8.5**

**Example 39: Tab visibility handling**
When tab becomes hidden during playback, render loop should pause appropriately.
**Validates: Requirements 8.6**

## Error Handling

### Fail-Fast Philosophy

This refactoring follows a fail-fast approach: if something is wrong, crash immediately rather than attempting graceful degradation. This makes bugs obvious during development rather than hiding them.

### Null Reference Handling

**DO NOT check for null references.** If a DOM reference is null when it should exist, that's a fatal bug that should crash:

```typescript
// ❌ DON'T: Silently skip updates
if (this.domRefs.progressRing) {
  this.domRefs.progressRing.style.strokeDashoffset = offset.toString();
}

// ✅ DO: Crash if reference is missing
this.domRefs.progressRing!.style.strokeDashoffset = offset.toString();
```

**Rationale:** If `progressRing` is null, either:
1. The template is broken (element not rendered)
2. `refreshDOMRefs()` wasn't called
3. The selector is wrong

All of these are bugs that should be caught immediately, not hidden.

### Missing Episode Element

**DO NOT handle missing episode elements gracefully.** If an episode element is missing, that's a fatal error:

```typescript
private reparentButtonToCurrentEpisode(): void {
  const currentShow = this.shows[this.currentShowIndex];
  const currentEpisodeIndex = this._getCurrentEpisodeIndex(currentShow);
  const episodeElement = this.episodeElements.find(
    e => e.showIndex === this.currentShowIndex && 
         e.episodeIndex === currentEpisodeIndex
  )?.element;
  
  // Crash if element is missing - this should never happen
  this.domRefs.playPauseButton!.remove();
  episodeElement!.appendChild(this.domRefs.playPauseButton!);
}
```

**Rationale:** If an episode element is missing when we try to reparent the button, the component is in an invalid state. This indicates a bug in the navigation logic or element caching that must be fixed.

### Missing Label Element

**DO NOT handle missing label elements gracefully.** If a label element is missing when we try to update it, that's a fatal error:

```typescript
private updateLabels(labelData: LabelData[]): void {
  labelData.forEach(label => {
    const selector = `.${label.className}[data-episode-key="${label.showIndex}-${label.episodeIndex}"]`;
    const element = this.shadowRoot!.querySelector(selector) as HTMLElement;
    
    // Crash if element is missing - this should never happen
    element.textContent = label.text;
    element.style.opacity = label.opacity.toString();
  });
}
```

**Rationale:** If a label element is missing, either:
1. The template didn't render labels for all episodes
2. The selector is wrong
3. The episode data is inconsistent

All of these are bugs that should be caught immediately.

### Render Loop Mode Switching Failures

If `updateStrategy()` is not called after state changes, the render loop may be in the wrong mode. This is prevented by:

1. Always calling `_updateRenderLoopStrategy()` in manual property setters
2. Extracting state change logic to dedicated handlers
3. Comprehensive testing of mode transitions

If mode switching fails, the symptoms will be obvious (animations don't run, or run when they shouldn't), making the bug easy to catch.


## Testing Strategy

### Dual Testing Approach

This refactoring uses a combination of:

1. **Manual testing**: Verify user-visible behavior after each phase using the testing checklist
2. **Example-based tests**: Verify specific implementation details (DOM structure, method calls, property values)

Property-based testing is not applicable here because:
- This is a refactoring that preserves existing behavior, not new functionality
- The properties are implementation details (DOM structure, method calls) rather than universal invariants
- Manual testing is more appropriate for verifying UI behavior and performance

### Testing Checklist (Run After Each Phase)

#### Basic Functionality
- App loads without console errors
- Shows and episodes display correctly
- Navigation works (drag horizontally/vertically)

#### Playback
- Clicking play starts playback
- Play icon → pause icon transition
- Progress ring appears and fills
- Playhead moves around ring
- Clicking pause stops playback
- Pause icon → play icon transition

#### Animations
- Play button fade in/out animation
- Radial push animation (episodes push away during play)
- Drag momentum/coast animation
- Snap animation

#### Edge Cases
- Auto-advance to next episode
- Seeking via playhead drag
- Loading state (spinner on track)
- Rapid play/pause toggling

### Performance Verification

After all phases complete, verify:

1. **No Lit re-renders during playback**: Monitor `requestUpdate()` calls (should be zero during steady-state playback)
2. **Smooth animations**: Use browser DevTools Performance tab to verify 60fps during navigation, 15fps during playback
3. **No SVG blurriness**: Visually inspect play/pause button and progress ring for clarity
4. **Reduced CPU usage**: Compare CPU usage before/after refactoring during playback

### Rollback Strategy

Each phase is a separate commit. If issues arise:

1. Identify which phase introduced the problem
2. `git revert` that commit
3. Debug and fix before re-applying
4. Re-run testing checklist


## Implementation Phases

### Phase 1: Remove `inlinePlaybackControls` Property

**Goal:** Simplify the component API by removing an always-true property.

**Rationale:** `inlinePlaybackControls` is always `true` in practice (hardcoded in `podcast-player.ts`). Removing it simplifies the code and removes unnecessary conditionals.

**Files to modify:**
- `src/xmb/xmb-browser.ts`
- `src/xmb/controllers/layout-calculator.ts`
- `src/app/podcast-player.ts`

**Changes:**

1. **xmb-browser.ts:**
   - Remove `@property({ type: Boolean }) inlinePlaybackControls = true;`
   - Remove from JSDoc `@property` documentation
   - Remove `&& this.inlinePlaybackControls` from `willUpdate()` condition
   - Remove `this.inlinePlaybackControls &&` from `_onDragStart()` condition
   - Change `inlinePlaybackControls: this.inlinePlaybackControls` to `inlinePlaybackControls: true` in `updateVisuals()`
   - Remove `&& this.inlinePlaybackControls` from render conditionals

2. **layout-calculator.ts:**
   - Remove `inlinePlaybackControls: boolean` from `LayoutContext` interface
   - Remove `&& ctx.inlinePlaybackControls` from `calculateEpisodeLayout()`
   - Remove `ctx.inlinePlaybackControls &&` from `calculateOpacity()`

3. **podcast-player.ts:**
   - Remove `.inlinePlaybackControls=${true}` from template

### Phase 2: Eliminate Runtime Conditional Rendering

**Goal:** Remove all conditional rendering based on runtime state. Only static conditions (config, show structure) may use conditional rendering.

**Rationale:** Conditional rendering (`${condition ? html\`...\` : ''}`) causes DOM element creation/destruction on every state change, Lit re-renders, SVG namespace issues, and inability to cache DOM references.

**Rule:** If a condition can change during user interaction (navigation, playback), it MUST NOT use conditional rendering. Use CSS (`display`, `opacity`, `visibility`) or DOM reparenting instead.

**Files to modify:**
- `src/xmb/xmb-browser.ts`

**Changes:**

1. **Play/pause button** — Render single button, reparent to current episode:
   ```typescript
   <div 
     class="play-pause-overlay"
     @click=${this._handlePlayPauseClick}
     style="transform: translateZ(0) scale(${XMB_CONFIG.maxZoom}); opacity: 0; pointer-events: none;"
   >
     <svg class="play-icon" viewBox="0 0 24 24" style="display: block">
       <path d="M8 5v14l11-7z"/>
     </svg>
     <svg class="pause-icon" viewBox="0 0 24 24" style="display: none">
       <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
     </svg>
   </div>
   ```

2. **Playback titles** — Always render with placeholder text:
   ```typescript
   <div class="playback-show-title" style="opacity: 0"></div>
   <div class="playback-episode-title" style="opacity: 0"></div>
   ```
   
   Title text content is updated in `updateVisuals()`:
   ```typescript
   this.domRefs.playbackShowTitle!.textContent = currentShow?.title ?? '';
   this.domRefs.playbackEpisodeTitle!.textContent = currentEpisode?.title ?? '';
   ```

3. **Circular progress SVG** — Always render, control visibility with opacity

**Note on button reparenting:** Phase 2 renders the button outside the episode loop. The button won't actually move to the center episode until Phase 4 implements `reparentButtonToCurrentEpisode()`. This is intentional - Phase 2 focuses on eliminating conditional rendering, Phase 4 adds the reparenting logic.


### Phase 3: Eliminate Conditional Rendering for Navigation Labels

**Goal:** Stabilize DOM structure for navigation labels and update them via direct DOM manipulation.

**Rationale:** Labels currently use conditional rendering and trigger `requestUpdate()` when changed, causing Lit re-renders.

**Files to modify:**
- `src/xmb/xmb-browser.ts`

**Changes:**

1. **Always render labels for all episodes/shows:**
   ```typescript
   ${this.episodeElements.map(ep => html`
     <div class="episode-label show-title-label" 
          data-episode-key="${ep.showIndex}-${ep.episodeIndex}"
          style="opacity: 0"></div>
     <div class="episode-label episode-title-label" 
          data-episode-key="${ep.showIndex}-${ep.episodeIndex}"
          style="opacity: 0"></div>
     <div class="episode-label side-episode-title-label" 
          data-episode-key="${ep.showIndex}-${ep.episodeIndex}"
          style="opacity: 0"></div>
   `)}
   
   ${this.shows.map((show, showIndex) => html`
     <div class="vertical-show-title" 
          data-show-index="${showIndex}"
          style="opacity: 0"></div>
   `)}
   ```

2. **Add `updateLabels()` method** to update labels directly via selectors

3. **Remove `requestUpdate()` batching** from `updateVisuals()`

### Phase 4: Add DOM Reference Cache

**Goal:** Cache references to frequently-updated DOM elements for direct manipulation.

**Rationale:** Direct DOM manipulation requires stable element references. Caching avoids repeated `querySelector` calls.

**Files to modify:**
- `src/xmb/xmb-browser.ts`

**Changes:**

1. **Add `domRefs` property** with references to all frequently-updated elements

2. **Add `refreshDOMRefs()` method** to populate cache after rendering

3. **Add `reparentButtonToCurrentEpisode()` method** to move button to current episode

4. **Call `refreshDOMRefs()` in `updated()`** after structure changes

5. **Call `reparentButtonToCurrentEpisode()` after navigation** in `_applySnapTarget()`

### Phase 5: Convert Playback State to Manual Getters/Setters

**Goal:** Prevent Lit re-renders when playback state changes, while maintaining correct render loop mode switching.

**Rationale:** `isPlaying`, `isLoading`, `playbackProgress` change frequently during playback. Converting to manual getters/setters allows updating visuals without triggering Lit's reactive system.

**Critical:** The setters MUST call `updateStrategy()` to maintain correct render loop mode switching.

**Files to modify:**
- `src/xmb/xmb-browser.ts`

**Changes:**

1. **Replace reactive properties with private fields + getters/setters:**
   ```typescript
   private _isPlaying = false;
   private _isLoading = false;
   private _playbackProgress = 0;
   
   get isPlaying(): boolean { return this._isPlaying; }
   set isPlaying(value: boolean) {
     const oldValue = this._isPlaying;
     this._isPlaying = value;
     if (oldValue !== value) {
       this._handlePlaybackStateChange(oldValue, this._isLoading);
       this._updateRenderLoopStrategy();
     }
   }
   ```

2. **Add `_updateRenderLoopStrategy()` helper** to call `updateStrategy()` with current state

3. **Extract playback state change logic** from `willUpdate()` to `_handlePlaybackStateChange()`

4. **Update `willUpdate()`** to remove `isPlaying`/`isLoading` handling


### Phase 6: Direct DOM Manipulation for Playback UI

**Goal:** Update playback UI elements directly without Lit re-renders.

**Rationale:** Progress ring, playhead, play/pause button, and playback titles update frequently. Direct manipulation is more efficient.

**Files to modify:**
- `src/xmb/xmb-browser.ts`

**Changes:**

1. **Add `updatePlaybackUI()` method:**
   ```typescript
   private updatePlaybackUI(): void {
     // Update progress ring stroke-dashoffset
     if (this.domRefs.progressRing) {
       const circumference = 2 * Math.PI * XMB_COMPUTED.progressRadius;
       const offset = circumference * (1 - this.playbackProgress);
       this.domRefs.progressRing.style.strokeDashoffset = offset.toString();
     }
     
     // Update playhead position
     if (this.domRefs.playhead && this.domRefs.playheadHitbox) {
       const shouldShow = this.isPlaying && this.playbackProgress > 0;
       const display = shouldShow ? 'block' : 'none';
       
       this.domRefs.playhead.style.display = display;
       this.domRefs.playheadHitbox.style.display = display;
       
       if (shouldShow) {
         const angle = this.playbackProgress * 2 * Math.PI - Math.PI / 2;
         const x = XMB_COMPUTED.progressRadius + Math.cos(angle) * XMB_COMPUTED.progressRadius;
         const y = XMB_COMPUTED.progressRadius + Math.sin(angle) * XMB_COMPUTED.progressRadius;
         
         this.domRefs.playhead.setAttribute('cx', (x + XMB_CONFIG.progressPadding / 2).toString());
         this.domRefs.playhead.setAttribute('cy', (y + XMB_CONFIG.progressPadding / 2).toString());
         this.domRefs.playheadHitbox.setAttribute('cx', (x + XMB_CONFIG.progressPadding / 2).toString());
         this.domRefs.playheadHitbox.setAttribute('cy', (y + XMB_CONFIG.progressPadding / 2).toString());
       }
     }
     
     // Update loading state
     if (this.domRefs.progressTrack) {
       if (this.isLoading) {
         this.domRefs.progressTrack.classList.add('loading');
       } else {
         this.domRefs.progressTrack.classList.remove('loading');
       }
     }
     
     // Update play/pause icon visibility
     if (this.domRefs.playIcon && this.domRefs.pauseIcon) {
       this.domRefs.playIcon.style.display = this.isPlaying ? 'none' : 'block';
       this.domRefs.pauseIcon.style.display = this.isPlaying ? 'block' : 'none';
     }
   }
   ```

2. **Update `updateVisuals()` for play/pause button:**
   ```typescript
   if (this.domRefs.playPauseButton) {
     const clampedScale = buttonScale < 0.01 ? 0 : buttonScale;
     this.domRefs.playPauseButton.style.transform = `translateZ(0) scale(${XMB_CONFIG.maxZoom})`;
     this.domRefs.playPauseButton.style.opacity = clampedScale.toString();
     this.domRefs.playPauseButton.style.pointerEvents = clampedScale > 0 ? 'auto' : 'none';
   }
   ```

3. **Call `updatePlaybackUI()` from `_onLowFreqFrame()`:**
   ```typescript
   private _onLowFreqFrame(_timestamp: number) {
     this.updateVisuals();
     this.updatePlaybackUI();
   }
   ```

4. **Simplify render() template** — Remove dynamic style calculations, use initial/default values

## Success Metrics

After all phases complete:

- No Lit `requestUpdate()` calls during steady-state playback
- Smooth 60fps animations during navigation
- Smooth 15fps progress updates during playback
- No SVG blurriness issues
- All existing functionality preserved
- Reduced CPU usage during playback (measurable via DevTools)
