/**
 * Math utility functions.
 *
 * @module client/util/math
 * @flow
 */

/** Basic two-element vector type. */
export type Vector2 = {x: number, y: number};

/** A basic line segment type. */
export type LineSegment = {start: Vector2, end: Vector2};

/**
 * Normalizes an angle to [-pi, pi].
 *
 * @param angle the angle to normalize.
 * @return the normalized angle.
 */
export function normalizeAngle(angle: number): number {
  while (angle < -Math.PI) {
    angle += 2.0 * Math.PI;
  }
  while (angle > Math.PI) {
    angle -= 2.0 * Math.PI;
  }
  return angle;
}

/**
 * Rounds a value to the specified decimal precision.
 *
 * @param value the value to round.
 * @param precision the precision (number of digits after the decimal point) to
 * round to.
 * @return the rounded value.
 */
export function roundToPrecision(value: number, precision: number): number {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}
