# XMB Browser Playback UI Specification

## Overview

The XMB (Cross Media Bar) browser features an interactive playback UI that differentiates between two states: **playing** and **paused**. This document describes the visual design, animations, and interaction behaviors.

---

## States

### Paused Mode

In paused mode, the XMB browser displays:
- Current episode of each show (left, center, right) at full opacity
- Non-current episodes fade in/out based on proximity when navigating
- Play/pause button centered on the current episode
- No circular progress indicator
- Full navigation enabled (swipe up/down/left/right)

### Playing Mode

In playing mode, the XMB browser displays:
- Radially pushed layout with extra space around the current episode
- Circular progress bar tracking playback position
- Play/pause button centered on the current episode
- Interactive playhead for seeking
- **Navigation locked** - no swiping allowed

---

## Visual Elements

### Play/Pause Button

**Appearance:**
- Circular blue button (48px diameter)
- Centered on the current episode's album art
- Matches the audio player's play/pause button design
- Shows play icon (▶) when paused, pause icon (⏸) when playing

**Behavior:**
- Clickable to toggle playback state
- Scales down from 1.0 to 0.0 as you drag away from center (paused mode only)
- Disappears completely at 0.5 icon offset during drag
- Scales up from 0.0 to 1.0 during snap animation to new episode
- Always visible at scale 1.0 when playing (no scaling)
- Higher z-index (15) ensures it's always clickable

**Interaction:**
- Click/tap toggles between play and pause
- Triggers the same playback control as the audio player button

### Circular Progress Bar

**Appearance:**
- Large circular track around the current episode (250px diameter)
- Gray track (rgba(255, 255, 255, 0.2), 8px stroke width)
- Blue progress indicator (#2563eb, 8px stroke width)
- White playhead handle (10px radius) with larger hit area (24px radius)
- Progress starts at 12 o'clock (top) and moves clockwise

**Visibility:**
- Only visible when playing
- Animates in with radial push (300ms duration)
- Animates out when pausing (300ms duration, reverse animation)
- Opacity tied to play animation progress (0 to 1)

**Interaction:**
- Playhead is draggable (mouse and touch supported)
- Drag to seek through the episode
- Only the playhead handle is interactive (not the entire circle)
- Seeking only occurs on release (not during drag)
- Visual progress updates in real-time during drag

**Constraints:**
- Playhead cannot jump across the 12 o'clock boundary
- To move from 95% to 5%, must drag counterclockwise through 0%
- If dragging clockwise past 12 o'clock, playhead gets stuck at ~100%
- If dragging counterclockwise past 12 o'clock, playhead gets stuck at 0%
- Prevents accidental jumps by tracking continuous movement

---

## Animations

### Radial Push Animation (Play)

**Trigger:** When playback starts (paused → playing)

**Duration:** 300ms

**Behavior:**
1. All adjacent episodes (above, below, left, right) push outward radially
2. Push distance: 1.0 icon size (72px)
3. Direction calculated from center point
4. Circular progress bar fades in simultaneously
5. Episodes remain visible during push (fade range expands)

**Easing:** Linear progress (no easing curve)

### Radial Collapse Animation (Pause)

**Trigger:** When playback stops (playing → paused)

**Duration:** 300ms

**Behavior:**
1. Circular progress bar fades out first
2. Adjacent episodes bounce back to original positions
3. Reverse of the radial push animation

**Easing:** Cubic ease-in (1 - (1 - progress)³)

### Play/Pause Button Scaling (Paused Mode)

**During Drag:**
- Scales linearly based on distance from center
- Formula: `scale = max(0, 1.0 - (totalOffset / 0.5))`
- Disappears at 0.5 icon offset
- Tied directly to drag offset (no lag)

**During Snap:**
- Scales up from 0.0 to 1.0 on new current episode
- Uses same easing as snap animation
- Synchronized with episode movement

---

## Interaction Behaviors

### Navigation (Paused Mode)

**Enabled:**
- Swipe left/right to change shows
- Swipe up/down to change episodes within current show
- Direction locking after threshold (0.2 icon sizes)
- Snap to nearest episode on release

**Visual Feedback:**
- Episodes move smoothly with drag
- Play/pause button scales down during drag
- Non-current episodes fade based on distance

### Navigation (Playing Mode)

**Disabled:**
- All swiping/dragging is locked
- User is "stuck" on the current episode
- Only playback controls are interactive

**Rationale:**
- Prevents accidental episode changes during playback
- Focuses interaction on playback controls
- User must pause to navigate

### Circular Progress Dragging

**Start:**
- Grab the playhead handle (24px hit area)
- Initializes from current playback position
- Tracks last angle to prevent jumps

**During Drag:**
- Visual progress updates immediately
- Playhead follows cursor/finger position
- Constrained to continuous circular movement
- Cannot jump across 12 o'clock boundary

**Release:**
- Seeks audio to new position
- Triggers `onSeek` callback with progress (0-1)
- Audio player updates and resumes playback

**Touch Support:**
- Full touch event support (touchstart, touchmove, touchend)
- Same behavior as mouse interaction
- 24px hit area for comfortable touch target

---

## Layout & Spacing

### Icon Sizing
- Base icon size: 72px
- Show spacing: 1.8 icon sizes (129.6px)
- Episode spacing: 1.8 icon sizes (129.6px)
- Radial push distance: 1.0 icon size (72px)

### Opacity & Fading
- Current episode of each show: Always opacity 1.0
- Non-current episodes: Fade based on show offset
- Fade range (paused): 0.5 icon offsets
- Fade range (playing): Expands to accommodate pushed episodes

### Scaling
- Max scale: 1.5x at center
- Scale distance: 3.3 icon sizes
- Scales down based on distance from screen center

---

## Z-Index Hierarchy

1. **Play/Pause Button** (z-index: 15) - Always on top, always clickable
2. **Circular Progress** (z-index: 10) - Only playhead is interactive
3. **Episode Items** (z-index: default) - Base layer

---

## Technical Implementation Notes

### State Synchronization
- XMB browser syncs with audio player every 100ms
- `isPlaying` property controls animation state
- `playbackProgress` (0-1) updates circular progress
- Bidirectional communication via callbacks

### Performance
- RequestAnimationFrame for smooth 60fps animations
- Cached episode elements for efficient rendering
- Direct style manipulation for position/opacity
- Template updates only when necessary

### Accessibility
- Play/pause button has proper ARIA labels
- Keyboard navigation not yet implemented
- Touch targets meet minimum size requirements (24px+)

---

## Future Enhancements

Potential improvements not yet implemented:
- Loading indicator during audio buffering
- Keyboard shortcuts for playback control
- Scrubbing preview (show timestamp while dragging)
- Haptic feedback on touch devices
- Accessibility improvements (screen reader support)
- Episode artwork loading states
