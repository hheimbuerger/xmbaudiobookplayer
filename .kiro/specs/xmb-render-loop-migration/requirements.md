# XMB Render Loop Migration - Requirements

## Overview

Move playback UI state (isPlaying, isLoading, playbackProgress) and label rendering from Lit reactive properties to the custom render loop with direct DOM manipulation. This creates a single, consistent rendering model where Lit handles initial structure and the render loop handles all runtime visual updates.

## Current State

- Episode positions/scales/opacities are handled by render loop
- Playback UI state triggers Lit re-renders
- `labelData` triggers Lit re-renders (with batching)
- Hybrid model: some DOM updates via Lit, some via render loop

## Target State

- Lit only re-renders when `shows` array changes (structural changes)
- All runtime visual updates go through render loop
- Playback UI (play/pause button, progress ring, playhead) updated via direct DOM manipulation
- Labels updated via direct DOM manipulation
- Single mental model: "Lit sets up structure, render loop handles all visual state"

## Acceptance Criteria

### AC1: Playback UI Direct Manipulation
- Play/pause button SVG icon changes via direct DOM manipulation
- Progress ring `stroke-dashoffset` updated directly
- Playhead position (cx, cy) updated directly
- Loading state class toggled directly on progress ring
- No Lit re-renders when playback state changes

### AC2: Label Direct Manipulation
- Label text content updated directly
- Label positions updated directly (already done via transform)
- Label opacity updated directly (already done)
- Label colors updated directly
- Remove `labelData` as a Lit reactive property

### AC3: State Management
- Playback state received via properties from orchestrator (isPlaying, isLoading, playbackProgress)
- Property changes trigger `requestAnimationFrame()` instead of `requestUpdate()`
- Render loop reads properties and updates DOM directly

### AC4: DOM Reference Management
- Cache references to frequently updated DOM elements:
  - Play/pause button SVG paths
  - Progress ring circle
  - Playhead circle
  - All label elements
- References updated when Lit re-renders structure (shows change)

### AC5: Render Loop Integration
- `updateVisuals()` method handles all playback UI updates
- Playback state changes call `requestAnimationFrame()` to schedule visual update
- No `requestUpdate()` calls for visual-only changes
- Maintain existing animation smoothness

### AC6: Lit Re-render Triggers
- Only `shows` property triggers Lit re-renders
- Configuration changes can still trigger re-renders (rare)
- After Lit re-render, refresh DOM references and continue render loop

## Dependencies

- Requires `.kiro/specs/xmb-audio-integration` to be complete
- Orchestrator must own audio element and update XMB browser state

## Blocked By

- `.kiro/specs/xmb-audio-integration`

## Blocks

- None (can be done in parallel with Media Session API)
