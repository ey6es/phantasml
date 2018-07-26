/**
 * Constants and utility functions shared between client and server.
 *
 * @module server/constants
 * @flow
 */

/** Email addresses must match this regex. */
export const EMAIL_PATTERN = /^[^@]+@[^.]+\.[^.]+/;

/** Maximum length for email addresses. */
export const MAX_EMAIL_LENGTH = 256;

/** Passwords must be at least this long. */
export const MIN_PASSWORD_LENGTH = 6;

/** Maximum length for passwords. */
export const MAX_PASSWORD_LENGTH = 256;

/**
 * Checks whether the specified email address is valid.
 *
 * @param email the email address to check.
 * @return whether or not the address is valid.
 */
export function isEmailValid(email: string): boolean {
  return EMAIL_PATTERN.test(email) && email.length <= MAX_EMAIL_LENGTH;
}

/**
 * Checks whether the specified password is valid.
 *
 * @param password the password to check.
 * @return whether or not the password is valid.
 */
export function isPasswordValid(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}
