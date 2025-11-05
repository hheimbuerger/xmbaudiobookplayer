---
inclusion: manual
---

# XMB Reference Frame Management in Snap Animations

**CRITICAL:** When snapping to a new show or episode, the reference frame changes, requiring careful offset adjustment.

## The Problem

The XMB browser uses a reference frame based on `currentShowIndex` and `currentEpisodeIndex`. When calculating positions:

```typescript
const showOffsetFromCenter = showIndex - currentShowIndex + offsetX;
```

When the user drags and releases, we:
1. Calculate which show/episode should be centered
2. Update `currentShowIndex` or `currentEpisodeIndex` to the target
3. Start a snap animation to center the new selection

**The trap:** If we start the snap animation with the drag offset directly, the animation plays in reverse because the reference frame has changed.

## Example Scenario

User drags from show 0 to show 1 with offset `-0.847`:

**WRONG (plays backwards):**
```typescript
// Calculate target
const targetShowIndex = Math.round(currentShowIndex - offsetX); // 0 - (-0.847) = 1

// Update reference frame
currentShowIndex = targetShowIndex; // Now 1

// Start snap with drag offset
animationController.startSnap(offsetX, offsetY); // -0.847

// During animation:
// showOffsetFromCenter = 0 - 1 + (-0.847) = -1.847
// Show 0 appears far left, animates to position -1
// Visually: animates from right to left (BACKWARDS!)
```

**CORRECT (plays forward):**
```typescript
// Calculate target AND delta BEFORE updating
const targetShowIndex = Math.round(currentShowIndex - offsetX); // 1
const showDelta = targetShowIndex - currentShowIndex; // 1 - 0 = 1

// Update reference frame
currentShowIndex = targetShowIndex; // Now 1

// Adjust offset by delta for new reference frame
const snapStartX = offsetX + showDelta; // -0.847 + 1 = 0.153

// Start snap with adjusted offset
animationController.startSnap(snapStartX, snapStartY);

// During animation:
// showOffsetFromCenter = 1 - 1 + 0.153 = 0.153
// Show 1 appears slightly right of center, animates to center
// Visually: animates from left to center (CORRECT!)
```

## The Rule

**When updating the reference frame (currentShowIndex or currentEpisodeIndex), always adjust the snap offset by the delta:**

```typescript
// 1. Calculate target and delta BEFORE updating
const showDelta = targetShowIndex - currentShowIndex;
const episodeDelta = targetEpisodeIndex - currentEpisodeIndex;

// 2. Update the reference frame
currentShowIndex = targetShowIndex;
// or
currentEpisodeId = targetEpisodeId;

// 3. Adjust snap offset by delta
const snapStartX = currentOffsetX + showDelta;
const snapStartY = currentOffsetY + episodeDelta;

// 4. Start snap with adjusted offset
animationController.startSnap(snapStartX, snapStartY);
```

## Why This Works

The offset adjustment compensates for the reference frame change:
- In the OLD frame: `offsetX = -0.847` meant "show 1 is slightly left of center"
- We update to NEW frame where show 1 is the reference (index 0 in relative terms)
- In the NEW frame: `offsetX = 0.153` still means "show 1 is slightly left of center"
- The visual position is preserved across the reference frame change
- The snap animation smoothly moves from 0.153 to 0 (slightly-left to center)

## Common Mistakes

❌ **Starting snap with drag offset directly after updating index**
```typescript
currentShowIndex = targetShowIndex;
animationController.startSnap(dragOffsetX, dragOffsetY); // WRONG!
```

❌ **Calculating delta after updating index**
```typescript
currentShowIndex = targetShowIndex;
const delta = targetShowIndex - currentShowIndex; // Always 0!
```

❌ **Forgetting to adjust offset**
```typescript
const delta = targetShowIndex - currentShowIndex;
currentShowIndex = targetShowIndex;
animationController.startSnap(dragOffsetX, dragOffsetY); // Forgot to add delta!
```

✅ **Correct pattern (always use this)**
```typescript
const delta = targetShowIndex - currentShowIndex;
currentShowIndex = targetShowIndex;
animationController.startSnap(dragOffsetX + delta, dragOffsetY);
```

## Testing This

To verify snap animations work correctly:
1. Drag slowly from first show to last show, release
2. Should animate smoothly in the direction of the drag
3. Should NOT snap backwards to the original position
4. Quick swipes should behave the same as slow drags
5. Vertical episode navigation should work identically

If animations play backwards or snap to the wrong position, check that offsets are being adjusted by the delta after updating the reference frame.
