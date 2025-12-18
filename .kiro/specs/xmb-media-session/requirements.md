# XMB Media Session API Integration - Requirements

## Overview

Integrate the Media Session API to support media keys (keyboard, Bluetooth headphones) and mobile OS media notifications (Android lock screen controls, notification drawer controls). This provides a native media player experience where external controls automatically work with XMB browser playback.

## Current State

- No Media Session API integration
- Media keys don't work
- No mobile OS media notifications
- Playback only controllable through XMB UI

## Target State

- Media Session API fully integrated
- Media keys control playback (play, pause, next, previous, seek)
- Mobile OS shows media notification with:
  - Episode title
  - Show/author name
  - Episode artwork
  - Play/pause button
  - Skip forward/backward buttons
- External controls call orchestrator methods which update XMB browser state and UI
- Metadata updates when episode changes

## Acceptance Criteria

### AC1: Media Session Registration
- Playback orchestrator registers Media Session action handlers on initialization
- Handlers are updated when playback capabilities change
- Handlers are cleaned up when orchestrator is destroyed

### AC2: Playback Control Actions
- `play` action - Resumes playback if paused
- `pause` action - Pauses playback
- `stop` action - Stops playback and clears current episode
- Actions call orchestrator methods which update XMB browser state

### AC3: Seek Actions
- `seekbackward` action - Skips backward 10 seconds (configurable)
- `seekforward` action - Skips forward 30 seconds (configurable)
- `seekto` action - Seeks to specific position (if supported by browser)
- Seek amounts configurable via XMB config

### AC4: Episode Navigation Actions
- `previoustrack` action - Goes to previous episode in current show
- `nexttrack` action - Goes to next episode in current show
- Handles edge cases (first/last episode)
- Optional: wraps to next/previous show if at boundary

### AC5: Metadata Updates
- Metadata updates when episode starts playing:
  - `title` - Episode title
  - `artist` - Show author
  - `album` - Show title
  - `artwork` - Episode cover image (multiple sizes)
- Metadata cleared when playback stops

### AC6: Position State Updates
- Position state updates during playback:
  - `duration` - Total episode duration
  - `position` - Current playback position
  - `playbackRate` - Playback speed (1.0 default)
- Updates at reasonable frequency (every 1-5 seconds)

### AC7: Mobile Notification Display
- Android shows notification with episode info and controls
- iOS shows lock screen controls (if supported)
- Notification persists during playback
- Notification dismisses when playback stops

## Browser Support

- Chrome/Edge: Full support (desktop + mobile)
- Firefox: Full support (desktop + mobile)
- Safari: Partial support (iOS lock screen, limited desktop)
- Check support: `'mediaSession' in navigator`

## Dependencies

- Requires `.kiro/specs/xmb-audio-integration` to be complete
- Orchestrator must own audio element
- Can be done in parallel with render loop migration

## Blocked By

- `.kiro/specs/xmb-audio-integration`

## Blocks

- None
