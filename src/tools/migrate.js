/**
 * Database setup/migration script.
 *
 * @module tools/migrate
 * @flow
 */

import {getUserByExternalId, inviteEmail} from '../server/user';

/**
 * Performs all necessary migrations, including creating and seeding tables.
 *
 * @param firstAdminEmail the email address of the first admin user to create,
 * if the user table doesn't yet exist.
 * @param fromEmail the email address to send from.
 * @param siteUrl the site URL, which may be a path relative to the current
 * working directory.
 */
export default async function migrate(
  firstAdminEmail: string,
  fromEmail: string,
  siteUrl: string,
) {
  // send the initial admin invite if the account doesn't exist
  const firstAdmin = await getUserByExternalId(firstAdminEmail);
  if (!firstAdmin) {
    console.log('Creating and sending initial admin invite');
    await inviteEmail(firstAdminEmail, 'en-US', true, fromEmail, siteUrl);
  }
}
