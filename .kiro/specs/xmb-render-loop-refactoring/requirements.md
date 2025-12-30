# Requirements Document

## Introduction

This specification defines the requirements for optimizing the XMB browser's render loop to reduce unnecessary Lit re-renders during playback and animations. The system currently triggers full component re-renders for frequently-updated elements like progress indicators and playback controls, causing performance overhead. This refactoring will use direct DOM manipulation for high-frequency updates while preserving all existing functionality and user experience.

## Glossary

- **XMB_Browser**: The main XrossMediaBar browser component implemented in Lit
- **Render_Loop_Controller**: Controller managing three render modes (idle, high-freq, low-freq)
- **Lit**: Web component framework using reactive properties that trigger re-renders
- **Direct_DOM_Manipulation**: Updating DOM elements directly via JavaScript without framework re-renders
- **Reactive_Property**: Lit `@property` decorator that triggers component re-render on change
- **DOM_Reference_Cache**: Cached references to frequently-updated DOM elements
- **Conditional_Rendering**: Template pattern `${condition ? html\`...\` : ''}` that creates/destroys DOM
- **Reparenting**: Moving an existing DOM element to a new parent via `appendChild()`


## Requirements

### Requirement 1: Remove Unused Configuration Property

**User Story:** As a developer, I want to remove the always-true `inlinePlaybackControls` property, so that the codebase is simpler and has fewer unnecessary conditionals.

#### Acceptance Criteria

1. WHEN the `inlinePlaybackControls` property is removed from XMB_Browser, THEN the component SHALL compile without errors
2. WHEN playback controls are rendered, THEN they SHALL always be inline without checking a property
3. WHEN the layout is calculated, THEN the Layout_Calculator SHALL assume inline controls are always enabled
4. WHEN the component is instantiated in Podcast_Player, THEN it SHALL NOT pass an `inlinePlaybackControls` attribute

### Requirement 2: Eliminate Runtime Conditional Rendering

**User Story:** As a developer, I want all runtime-variable UI elements to be always-rendered with CSS visibility control, so that DOM structure remains stable and SVG namespace issues are avoided.

#### Acceptance Criteria

1. WHEN an element's visibility depends on runtime state (navigation, playback), THEN the element SHALL be always rendered in the template
2. WHEN an element's visibility changes, THEN the system SHALL update CSS properties (`display`, `opacity`, `visibility`) via direct DOM manipulation
3. WHEN the play/pause button is rendered, THEN a single button element SHALL exist and be reparented to the current center episode
4. WHEN both play and pause icons are rendered, THEN both SHALL always exist in DOM with visibility controlled by `display` property
5. WHEN playback title elements are rendered, THEN they SHALL always exist with content updated via direct DOM manipulation
6. WHEN the circular progress SVG is rendered, THEN it SHALL always exist with visibility controlled by opacity
7. WHEN conditional rendering is used, THEN it SHALL only be for static conditions (config values, data structure checks)

### Requirement 3: Stabilize Navigation Label DOM Structure

**User Story:** As a developer, I want navigation labels to always be rendered for each episode/show and updated via direct DOM manipulation, so that label updates don't trigger Lit re-renders.

#### Acceptance Criteria

1. WHEN navigation labels are rendered, THEN the system SHALL render label elements for each episode and show
2. WHEN label content needs to update, THEN the system SHALL update existing label elements via direct DOM manipulation
3. WHEN label data changes, THEN the system SHALL NOT call `requestUpdate()` on the component
4. WHEN labels are not visible, THEN they SHALL have opacity 0 rather than being conditionally removed from DOM

### Requirement 4: Cache DOM Element References

**User Story:** As a developer, I want frequently-updated DOM elements to be cached in a reference object, so that direct manipulation doesn't require repeated `querySelector` calls.

#### Acceptance Criteria

1. WHEN the component renders, THEN the system SHALL cache references to all frequently-updated DOM elements
2. WHEN the DOM structure changes, THEN the system SHALL refresh the cached references
3. WHEN the play/pause button needs repositioning, THEN the system SHALL reparent it to the current center episode element
4. WHEN cached references are accessed and found to be null, THEN the system SHALL crash immediately (fail-fast approach)
5. WHEN the component updates, THEN button reparenting SHALL occur after navigation completes

### Requirement 5: Convert Playback State to Manual Properties

**User Story:** As a developer, I want playback state properties to use manual getters/setters instead of Lit reactive properties, so that playback state changes don't trigger full component re-renders.

#### Acceptance Criteria

1. WHEN `isPlaying` changes, THEN the setter SHALL update internal state and call render loop strategy update
2. WHEN `isLoading` changes, THEN the setter SHALL update internal state and call render loop strategy update
3. WHEN `playbackProgress` changes, THEN the setter SHALL update internal state without triggering re-render
4. WHEN playback state changes, THEN the render loop mode SHALL switch correctly (idle/low-freq/high-freq)
5. WHEN play/pause transitions occur, THEN animations SHALL trigger correctly via state change handlers
6. WHEN the component is queried for playback state, THEN getters SHALL return current values

### Requirement 6: Update Playback UI via Direct DOM Manipulation

**User Story:** As a developer, I want playback UI elements (progress ring, playhead, play/pause icons) to update via direct DOM manipulation, so that high-frequency playback updates don't cause Lit re-renders.

#### Acceptance Criteria

1. WHEN playback progress updates, THEN the progress ring stroke-dashoffset SHALL be updated directly
2. WHEN playback progress updates, THEN the playhead position SHALL be calculated and updated directly
3. WHEN playback state changes between playing and paused, THEN play/pause icon visibility SHALL be toggled via `display` property
4. WHEN loading state changes, THEN the progress track loading class SHALL be added or removed directly
5. WHEN the play/pause button scale changes, THEN its transform and opacity SHALL be updated directly
6. WHEN the low-frequency render loop executes, THEN playback UI SHALL be updated without triggering Lit re-render

### Requirement 7: Preserve Existing Functionality

**User Story:** As a user, I want all existing XMB browser functionality to work identically after the refactoring, so that my experience is unchanged.

#### Acceptance Criteria

1. WHEN the user navigates horizontally or vertically, THEN drag, momentum, and snap animations SHALL work as before
2. WHEN the user clicks play, THEN playback SHALL start and the progress ring SHALL appear and fill
3. WHEN the user clicks pause, THEN playback SHALL stop and the play icon SHALL appear
4. WHEN playback reaches the end, THEN auto-advance to the next episode SHALL work correctly
5. WHEN the user drags the playhead, THEN seeking SHALL work correctly
6. WHEN loading state is active, THEN the spinner animation SHALL appear on the progress track
7. WHEN rapid play/pause toggling occurs, THEN the system SHALL handle it without errors
8. WHEN animations are active, THEN they SHALL run at 60fps without jank

### Requirement 8: Maintain Render Loop Mode Switching

**User Story:** As a developer, I want the render loop to maintain correct mode switching after converting to manual properties, so that performance optimizations are preserved.

#### Acceptance Criteria

1. WHEN no updates are needed, THEN the render loop SHALL be in idle mode (0 FPS)
2. WHEN drag, momentum, snap, or animations are active, THEN the render loop SHALL be in high-freq mode (60 FPS)
3. WHEN playback is active with no animations, THEN the render loop SHALL be in low-freq mode (15 FPS)
4. WHEN playback state changes, THEN the render loop strategy SHALL be updated immediately
5. WHEN high-freq animations complete, THEN the render loop SHALL transition to the appropriate next mode
6. WHEN the tab becomes hidden during playback, THEN the render loop SHALL pause appropriately
