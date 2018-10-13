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
