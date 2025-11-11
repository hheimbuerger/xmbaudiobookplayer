# XMB User Experience

## Overview

The XMB (Cross Media Bar) browser provides an intuitive interface for navigating and playing podcast episodes.

Inspired by the PlayStation 3 XrossMediaBar, it uses a grid-based navigation system where shows are arranged side-by-side horizontally and episodes are stacked vertically. The one episode in the very center is the active episode, which can be played back inline in the browser. When switching to playback mode, the UI then makes space to display metadata and a scrubber.

This document describes the visual design, animations, and interaction behaviors from the user's perspective. For technical implementation details, code architecture, and component interactions, see [XMB Architecture](./xmb-architecture.md).

## Concept

**Grid Structure:**
- Shows arranged horizontally (left/right)
- Episodes arranged vertically (up/down) within each show
- Current episode of current show centered on screen
- Horizontal axis shows current episode of each show
- Vertical axis shows all episodes of current show only

**Visual Design:**
- Square episode thumbnails with rounded corners
- Show icon (emoji or image) fills thumbnail
- Episode number badge at bottom-right corner
- Black background
- Items scale up as they approach center (creates depth)

**Offset System:**
The navigation uses a normalized offset system where positions are expressed in show/episode units rather than pixels:
- Offset 0: Current item centered on screen
- Offset 1.0: Next item centered on screen
- Offset 0.5: Halfway between items
- This ensures consistent behavior regardless of screen size

## Usage Scenarios

### Browsing Content

**Finding a Show:**
1. Swipe left or right to browse shows
2. Show titles appear on sides during swipe
3. Release to snap to desired show
4. Each show displays its current episode

**Finding an Episode:**
1. Navigate to desired show
2. Swipe up or down to browse episodes
3. Episode titles appear on right during swipe
4. Release to snap to desired episode

### Playing Content

**Starting Playback:**
1. Browse to desired episode
2. Tap play button
3. Wait for loading (pulsing ring appears)
4. Playback starts automatically

**Pausing Playback:**
1. Tap pause button during playback
2. Episodes collapse back to browsing layout
3. Navigation unlocks
4. Can now swipe to different episodes

**Seeking Within Episode:**
1. During playback, drag playhead around progress ring
2. Visual progress updates immediately
3. Release to seek audio to new position
4. Playback continues from new position

### Binge Listening

**Auto-Advance:**
1. Start first episode of a show
2. Episode finishes automatically
3. Next episode loads and plays
4. Continues until last episode or user pauses

**Switching Shows:**
1. Pause current episode
2. Swipe left/right to different show
3. Returns to last episode of that show
4. Tap play to resume

### Key Behaviors

**Navigation:**
- Swipe to browse shows and episodes
- Cannot navigate during playback (must pause first)
- Each show remembers your last episode
- Position persists across browser sessions

**Playback:**
- Play button starts playback
- Pause button stops playback
- Episodes auto-advance within same show
- Progress saves automatically

**Visual Cues:**
- Expanded layout means playback is active
- Progress ring shows playback status
- Pulsing ring means loading
- Blue arc shows current progress

## Visual States

The XMB browser displays three distinct visual states based on playback:

### Paused Mode

**Appearance:**
- Current episode of each show displayed at full brightness
- Non-current episodes fade based on distance
- Play button (▶) centered on current episode
- Compact layout with episodes close together
- No progress indicator

**What Users Can Do:**
- Swipe left/right to browse different shows
- Swipe up/down to browse episodes within a show
- Tap play button to start playback
- Navigate freely without restrictions

### Loading Mode

**Appearance:**
- Episodes push outward from center (expanded layout)
- Circular progress ring appears around current episode
- Ring pulses from gray to blue (loading animation)
- Pause button (⏸) centered on current episode
- No playhead or progress arc visible

**What Users Can Do:**
- Tap pause button to cancel loading
- Cannot swipe or navigate (locked on current episode)
- Wait for episode to load

**Purpose:**
- Immediate feedback that play was registered
- Prevents accidental episode changes during load
- Shows system is working

### Playing Mode

**Appearance:**
- Episodes pushed outward from center (same as Loading)
- Circular progress ring with blue progress arc
- White playhead handle shows current position
- Pause button (⏸) centered on current episode
- Show and episode titles displayed above and below progress ring

**What Users Can Do:**
- Tap pause button to pause playback
- Drag playhead to seek through episode
- Cannot swipe or navigate (locked on current episode)

## Navigation

### Swiping Between Shows

**Gesture:** Swipe left or right

**Behavior:**
- Entire grid slides left/right as shows move together
- All shows move horizontally in unison
- Current show stays centered on screen
- Adjacent shows visible on sides
- Current episode of each show remains visible
- Smooth coasting with physics-based deceleration
- Clamps to first/last show at boundaries

**Visual Feedback:**
- Vertical show titles appear on sides during swipe
- Shows fade based on distance from center
- Current show remains at full brightness

### Swiping Between Episodes

**Gesture:** Swipe up or down

**Behavior:**
- Only current show's episodes slide up/down
- Other shows remain stationary (not affected)
- Only affects the show you're currently viewing
- Current episode stays centered on screen
- Adjacent episodes visible above and below
- Smooth coasting with physics-based deceleration
- Clamps to first/last episode at boundaries

**Visual Feedback:**
- Episode titles appear on right side during swipe
- Episodes fade based on distance from center
- Current episode remains at full brightness
- Episode numbers visible on each thumbnail

### Direction Locking

**Behavior:**
- First swipe determines direction (horizontal or vertical)
- Once direction is locked, movement restricted to that axis
- Prevents diagonal swiping
- Lock releases when swipe ends

**Threshold:**
- Small movements don't lock direction immediately
- Allows user to adjust finger position
- Once threshold exceeded, direction is locked

### Navigation System (Coast and Snap)

**Trigger:** Release swipe gesture

**Behavior:**
- **Fast swipes (with velocity):** Coast animation smoothly decelerates to target
  - Target calculated immediately on release
  - Duration scales with velocity and distance (150-800ms)
  - Uses cubic ease-out for natural deceleration
  - Items glide with physics-based momentum, then settle at target
- **Slow drags (no velocity):** Snap animation to nearest position
  - Fixed 500ms duration
  - Cubic ease-out easing
  - Quick transition when coasting would be imperceptible
- Grid automatically centers on target show/episode
- No jarring jumps, oscillation, or overshoot
- Natural, predictable feel

**Target Selection:**
- Calculates which item is closest to screen center
- Rounds to nearest show/episode
- Clamps to first/last item at boundaries

**Early Loading:**
- Episode loading starts immediately when drag is released
- Loading happens in parallel with animation
- By the time animation finishes, episode may already be loaded
- Significantly reduces perceived loading time

## Playback Controls

### Play/Pause Button

**Appearance:**
- Circular blue button
- Centered on current episode's album art
- Play icon (▶) when paused
- Pause icon (⏸) when playing or loading

**Behavior:**
- Tap to toggle between play and pause
- Hides during swipe gestures (paused mode only)
- Always visible during playback or loading
- Responds immediately to taps

**Visual Feedback:**
- Button scales slightly on hover (desktop)
- Smooth icon transition when state changes
- No rectangular touch highlight on mobile

### Circular Progress

**Appearance:**
- Large ring around current episode
- Gray track shows full duration
- Blue arc shows progress (playing mode only)
- White playhead handle at current position (playing mode only)

**Loading State:**
- Only gray track visible
- Track pulses from gray to blue
- Indicates system is working
- Not interactive

**Playing State:**
- Gray track + blue progress arc + white playhead
- Progress updates in real-time
- Playhead draggable for seeking

**Seeking:**
- Drag playhead to any position
- Visual progress updates immediately
- Audio seeks on release
- Playhead follows finger/cursor smoothly

**Constraints:**
- Playhead moves continuously around circle
- Cannot jump across 12 o'clock position
- To move from 11 o'clock to 1 o'clock, must drag counterclockwise through 12, 11, 10, 9... all the way around
- To move from 1 o'clock to 11 o'clock, must drag clockwise through 2, 3, 4... all the way around
- Prevents accidental jumps by requiring continuous movement

## Animations

### Starting Playback

**Trigger:** Tap play button

**Animation:**
1. Episodes push outward radially
2. Circular progress ring fades in
3. Button changes to pause icon
4. Navigation locks

**Feel:**
- Smooth and fluid
- Clear visual indication of state change
- Episodes remain visible during animation

### Stopping Playback

**Trigger:** Tap pause button or episode ends

**Animation:**
1. Circular progress ring fades out
2. Episodes return to original positions
3. Button changes to play icon
4. Navigation unlocks

**Feel:**
- Smooth bounce-back effect
- Clear return to browsing mode

### Loading Animation

**Appearance:**
- Track color pulses from gray to blue
- Continuous cycle
- Subtle and non-distracting

**Purpose:**
- Shows system is actively loading
- Provides feedback without specific progress
- Indicates user should wait

### Episode Navigation

**Trigger:** Release swipe gesture

**Animation:**
- **Fast swipes:** Coast animation with smooth deceleration (150-800ms depending on velocity)
- **Slow drags:** Snap animation to nearest position (500ms)
- Episodes smoothly transition to centered position
- Play button scales up on new current episode

**Feel:**
- Natural coasting that respects swipe velocity
- Smooth easing (cubic ease-out) prevents jarring stops
- Clear destination
- Satisfying arrival at target (settle)

**Early Loading:**
- Episode loading starts immediately when drag is released
- Loading happens in parallel with animation
- By the time animation finishes, episode may already be loaded
- No waiting after visual transition completes

### Play Button During Navigation

**Behavior:**
- Button disappears when drag direction is locked
- Stays hidden during coasting animation
- Visible during snap animation (quick transition)
- Reappears instantly when navigation completes
- Always visible during playback or loading

**Purpose:**
- Reduces visual clutter during navigation
- Prevents accidental clicks during drag/coast
- Clear focus on browsing
- Always accessible when needed (playback/loading)

## Touch and Mouse Support

### Touch Gestures

**Supported:**
- Tap to play/pause
- Swipe to navigate
- Drag playhead to seek
- Physics-based coasting

**Optimizations:**
- Adequate touch target size for playhead
- No rectangular touch highlight on buttons
- Smooth tracking of finger movement
- Works correctly in mobile browsers

### Mouse Interactions

**Supported:**
- Click to play/pause
- Drag to navigate
- Drag playhead to seek
- Physics-based coasting

**Optimizations:**
- Hover effects on buttons
- Smooth cursor tracking
- Works identically to touch

### Click vs Drag Detection

**Smart Detection:**
- Quick taps (< 200ms, < 10px movement) treated as clicks
- Longer movements treated as drags
- Prevents accidental actions
- Works for both touch and mouse

**Scenarios:**
- Tap play button: Playback starts ✓
- Quick tap with slight movement: Still treated as tap ✓
- Start drag on play button, move to change episode: Drag works, click blocked ✓
- Tap during snap animation: Works immediately ✓

## Visual Feedback

### Episode Scaling

**Behavior:**
- Current episode scales up (1.8x)
- Episodes scale down based on distance from center
- Smooth scaling during navigation
- Creates depth and focus

### Episode Fading

**Opacity Rules:**
- Current episode of each show: Always at full brightness (opacity 1.0)
- Non-current episodes: Fade based on their show's distance from center
  - Fully visible when their show is centered
  - Fade out as their show moves away horizontally
  - Invisible when show is far from center
- Fade range adjusts during playback (more episodes visible)
- Creates clear visual hierarchy and focus

### Label Display

**Paused Mode:**
- No labels visible
- Clean, minimal appearance
- Focus on album art

**Vertical Swipe:**
- Episode titles appear on right side
- Show which episode you're browsing
- Fade in smoothly during swipe

**Horizontal Swipe:**
- Show titles appear vertically on sides
- Show which show you're browsing
- Fade in smoothly during swipe

**Playing Mode:**
- Show title above progress ring
- Episode title below progress ring
- Blue color indicates active playback

### Color Transitions

**Episode Labels:**
- Center episode: Vibrant blue (#3b82f6)
- Distant episodes: Bright white
- Smooth color transition based on distance
- Creates visual flow

## Auto-Advance

**Behavior:**
When an episode finishes:
1. Playback stops with pause animation
2. Automatically navigates to next episode
3. Starts playing next episode

**Constraints:**
- Only advances within same show
- If at last episode, playback stops
- User can interrupt by pausing or navigating

**Visual Flow:**
- Clear transition between episodes
- Progress bar disappears during navigation
- Progress bar reappears when next episode starts
- Smooth, uninterrupted experience

## Layout and Spacing

### Episode Grid

**Spacing:**
- Shows evenly spaced horizontally
- Episodes evenly spaced vertically
- Current episode centered on screen
- Grid extends infinitely in all directions

**Sizing:**
- Episodes scale up as they approach center
- Maximum scale at center (1.8x)
- Smooth scaling based on distance

### Z-Index Hierarchy

**Layering (front to back):**
1. Play/pause button (always on top)
2. Circular progress ring
3. Episode thumbnails

**Purpose:**
- Button always clickable
- Progress ring visible but not blocking
- Clear visual hierarchy

## Accessibility

### Touch Targets

**Sizes:**
- Play/pause button: Large enough for comfortable tapping
- Playhead: Adequate hit area for dragging
- Meets minimum touch target requirements

### Visual Clarity

**Contrast:**
- High contrast between elements
- Clear button icons
- Visible progress indicators

### Feedback

**Immediate Response:**
- Button state changes instantly
- Progress updates in real-time
- Clear loading indicators

## Performance

### Smooth Animations

**Frame Rate:**
- Consistent 60fps during all animations
- No stuttering or lag
- Smooth coasting with physics-based deceleration

**Optimizations:**
- GPU-accelerated rendering
- Efficient update batching
- High-quality image rendering

### Responsive

**Touch Response:**
- Immediate feedback to touch
- No input lag
- Smooth tracking of gestures

**Loading:**
- Fast initial render
- Smooth transitions between states
- Efficient memory usage

## Configuration

### Inline Playback Controls

The playback UI can be enabled or disabled:

**Enabled (default):**
- Full playback UI with play/pause button
- Circular progress ring during playback
- Radial push animation
- Navigation locked during playback

**Disabled:**
- No playback UI elements
- No radial push animation
- Navigation always enabled
- XMB browser only for browsing

## State Persistence

**What Gets Remembered:**
- Current show selection
- Current episode for each show (independent)
- Playback position within each episode (via media repository)
- State persists across browser sessions

**Behavior:**
- Each show remembers which episode was last viewed
- Switching between shows returns to last episode
- Closing and reopening browser returns to same episode
- Playback position is synced back to the media repository
- Playback position is restored from media repository on when switching episodes
