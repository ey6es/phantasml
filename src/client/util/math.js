/**
 * Math utility functions.
 *
 * @module client/util/math
 * @flow
 */

/**
 * Converts a value in degrees to radians.
 *
 * @param value the value in degrees.
 * @return the value in radians.
 */
export function radians(value: number): number {
  return (value * Math.PI) / 180.0;
}

/**
 * Converts a value in radians to degrees.
 *
 * @param value the value in radians.
 * @return the value in degrees.
 */
export function degrees(value: number): number {
  return (value * 180.0) / Math.PI;
}

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
