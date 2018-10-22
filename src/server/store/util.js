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
