/**
 * Store utility functions.
 *
 * @module server/store/util
 * @flow
 */

/**
 * Gets a value, if specified, or a default, if not.
 *
 * @param value the optionally-set value.
 * @param defaultValue the default value.
 * @return the value to use.
 */
export function getValue<T>(value: ?T, defaultValue: T): T {
  return value == null ? defaultValue : value;
}

/**
 * Compares the contents of two sets for strict equality.
 *
 * @param s1 the first set to compare.
 * @param s2 the second set to compare.
 * @return whether or not the contents are equal.
 */
export function setsEqual<T>(s1: Set<T>, s2: Set<T>): boolean {
  if (s1.size !== s2.size) {
    return false;
  }
  for (const element of s1) {
    if (!s2.has(element)) {
      return false;
    }
  }
  return true;
}

/**
 * Compares the contents of two maps for strict equality.
 *
 * @param m1 the first map to compare.
 * @param m2 the second map to compare.
 * @return whether or not the contents are equal.
 */
export function mapsEqual<K, V>(m1: Map<K, V>, m2: Map<K, V>): boolean {
  if (m1.size !== m2.size) {
    return false;
  }
  for (const [key, value] of m1) {
    if (m2.get(key) !== value) {
      return false;
    }
  }
  return true;
}

/**
 * Converts a hex color string to an array of floats that we can use as a
 * uniform value.
 *
 * @param value the hex color string.
 * @return the corresponding array of floats.
 */
export function getColorArray(value: string): number[] {
  return [
    parseInt(value.substring(1, 3), 16) / 255.0,
    parseInt(value.substring(3, 5), 16) / 255.0,
    parseInt(value.substring(5, 7), 16) / 255.0,
  ];
}
