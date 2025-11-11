/**
 * Circular progress controller for XMB browser
 * Handles circular progress dragging and seeking
 */

export class CircularProgressController {
  private dragging = false;
  private dragAngle = 0;
  private lastAngle = 0;

  /**
   * Start circular progress dragging
   */
  public startDrag(initialAngle: number): void {
    this.dragging = true;
    this.lastAngle = initialAngle;
    this.dragAngle = initialAngle;
  }

  /**
   * Update circular progress drag angle with jump prevention
   */
  public updateDrag(angle: number): void {
    if (!this.dragging) {
      return;
    }

    // Prevent jumping across the 12 o'clock boundary
    const lastAngle = this.lastAngle;
    const angleDiff = angle - lastAngle;
    const maxJump = Math.PI; // 180 degrees

    // Detect if we're trying to jump across the boundary
    if (Math.abs(angleDiff) > maxJump) {
      // Keep playhead at current position
      // User must drag continuously around the circle
      return;
    }

    this.dragAngle = angle;
    this.lastAngle = angle;
  }

  /**
   * End circular progress dragging and return final progress (0-1)
   */
  public endDrag(): number {
    this.dragging = false;
    return this.dragAngle / (2 * Math.PI);
  }

  /**
   * Check if circular progress is being dragged
   */
  public isDragging(): boolean {
    return this.dragging;
  }

  /**
   * Get current circular progress drag angle
   */
  public getDragAngle(): number {
    return this.dragAngle;
  }
}
