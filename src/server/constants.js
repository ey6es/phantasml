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

/**
 * Checks whether the specified email address is valid.
 *
 * @param email the email address to check.
 * @return whether or not the address is valid.
 */
export function isEmailValid(email: string): boolean {
  return EMAIL_PATTERN.test(email) && email.length <= MAX_EMAIL_LENGTH;
}

/** Passwords must be at least this long. */
export const MIN_PASSWORD_LENGTH = 6;

/** Maximum length for passwords. */
export const MAX_PASSWORD_LENGTH = 256;

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

/** Minimum length for the display names. */
export const MIN_DISPLAY_NAME_LENGTH = 2;

/** Maximum length for display names. */
export const MAX_DISPLAY_NAME_LENGTH = 64;

/**
 * Checks whether the specified display name is valid.
 *
 * @param name the name to check.
 * @return whether or not the name is valid.
 */
export function isDisplayNameValid(name: string): boolean {
  return (
    name.length >= MIN_DISPLAY_NAME_LENGTH &&
    name.length <= MAX_DISPLAY_NAME_LENGTH
  );
}

/** The available resource types (as an object so that we can use $Keys). */
export const RESOURCE_TYPES = {environment: 0};

/** Minimum length for resource names. */
export const MIN_RESOURCE_NAME_LENGTH = 1;

/** Maximum length for resource names. */
export const MAX_RESOURCE_NAME_LENGTH = 64;

/**
 * Checks whether the specified resource name is valid.
 *
 * @param name the name to check.
 * @return whether or not the name is valid.
 */
export function isResourceNameValid(name: string): boolean {
  return (
    name.length >= MIN_RESOURCE_NAME_LENGTH &&
    name.length <= MAX_RESOURCE_NAME_LENGTH
  );
}

/** Maximum length for resource descriptions. */
export const MAX_RESOURCE_DESCRIPTION_LENGTH = 512;

/**
 * Checks whether the specified resource description is valid.
 *
 * @param name the description to check.
 * @return whether or not the description is valid.
 */
export function isResourceDescriptionValid(description: string): boolean {
  return description.length <= MAX_RESOURCE_DESCRIPTION_LENGTH;
}
