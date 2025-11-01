# XMB Podcast Browser - Interaction Design

## Concept
Touch/mouse interface inspired by PlayStation 3 XrossMediaBar for browsing podcast shows and episodes.

## Layout
- **Grid structure**: Shows arranged horizontally, episodes arranged vertically
- **Screen center**: At rest, displays the current episode of the current show
- **Horizontal axis**: Shows the current episode of each show
- **Vertical axis**: Shows all episodes of the current show only (other shows remain locked)

## Visual Elements
- **Episode icons**: Square boxes with rounded corners containing show emoji and episode number badge
- **Badge**: Positioned at bottom-right corner
- **Background**: Black
- **Scaling**: Items scale up as they approach screen center, creating depth perception

## Interaction Model

### System States
1. **Idle**: No interaction, all offsets at 0
2. **Dragging**: User actively dragging, offsets follow input
3. **Snapping**: Animation running, offsets animate back to 0

### Offset System
- **Normalized offsets**: Position expressed in show/episode units rather than pixels
  - Offset 0: Current item centered
  - Offset 1.0: Next item centered
  - Offset 0.5: Halfway between items
  - Allows consistent behavior regardless of screen size or spacing configuration

### Dragging
- **Direction locking**: First significant movement locks to horizontal or vertical for the entire drag
- **Horizontal drag**: Slides entire grid left/right to browse between shows
- **Vertical drag**: Slides only the current show's episodes up/down, other shows remain stationary

### Opacity Rules
- Current episode of each show: Always fully visible
- Non-current episodes: Fade based on horizontal distance from their show's center
  - Fully visible when their show is centered
  - Fade out as their show moves away from center
  - Invisible when show is far from center

### Snapping
- **Trigger**: On drag release
- **Target selection**: Snaps to whichever show/episode is closest to screen center
- **Animation**: Smooth ease-out animation that maintains visual continuity
  - State updates immediately
  - Visual elements animate from their current position to final position
  - No jarring jumps or discontinuities
- **Boundaries**: Clamps to first/last show or episode when dragging beyond grid limits

## State
- Tracks currently selected show
- Tracks currently selected episode for each show independently
- State persists across sessions
- Each show remembers which episode was last viewed

## Architecture
- **Component**: `<xmb-browser>` - Lit web component handling UI and interactions
  - Properties: `shows` (array), `currentShowIndex` (number), `onStateChange` (callback)
  - Encapsulates all drag/snap logic and rendering
  - Emits state changes via callback for external persistence
- **Persistence**: External utilities in app.js
  - `loadState()` - Loads state from localStorage
  - `saveState()` - Saves state to localStorage
  - Separated from component for flexibility (can swap storage backends)
- **Structure**: Component lives in `components/` folder following best practices
