/**
 * Request handlers related to help.
 *
 * @module server/help
 * @flow
 */

import {randomBytes} from 'crypto';
import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {getSettings} from './util/database';
import {BUILD_TIME, handleBodyRequest} from './util/handler';
import {FROM_EMAIL, FIRST_ADMIN_EMAIL, ses} from './util/email';
import type {HelpReportBugRequest, HelpReportBugResponse} from './api';
import {HelpReportBugRequestType} from './api';
import {isBugDescriptionValid} from './constants';
import {getSession, getUser} from './user';

/**
 * Returns the email to use for bug reports.
 *
 * @param settings the site settings, if any.
 * @return the bug report email.
 */
export function getBugReportEmail(settings: ?Object): string {
  return (
    (settings && settings.bugReportEmail && settings.bugReportEmail.S) ||
    FIRST_ADMIN_EMAIL
  );
}

export function reportBug(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    HelpReportBugRequestType,
    (async request => {
      if (!isBugDescriptionValid(request.description)) {
        throw new Error('Invalid bug description: ' + request.description);
      }
      const [session, settings] = await Promise.all([
        getSession(request.authToken),
        getSettings(),
      ]);
      const user = session ? await getUser(session.userId.S) : null;
      const displayName = String(
        user && user.displayName && user.displayName.S,
      );
      const bugReportEmail = getBugReportEmail(settings);
      const subject = request.description.replace(/\s/g, ' ').trim();
      const boundary = randomBytes(32).toString('hex');
      const message = `From: "Phantasml bugs" <${FROM_EMAIL}>
To: ${bugReportEmail}
Subject: "${subject.length > 40 ? subject.substring(0, 40) + '...' : subject}"
Content-Type: multipart/mixed; boundary=${boundary}

--${boundary}
Content-Type: text/plain
Content-Transfer-Encoding: quoted-printable

"${request.description}"

Token: ${request.authToken || 'none'}
User: ${user ? `${user.id.S}/${user.externalId.S}/${displayName}` : 'none'}
User Agent: ${request.userAgent}
URL: ${request.url}
Client Build: ${getTimeString(request.buildTime)}
Server Build: ${getTimeString(BUILD_TIME)}

--${boundary}
Content-Type: text/plain; name="client.txt"
Content-Description: client.txt
Content-Disposition: attachment;filename="client.txt";
    creation-date="${new Date().toUTCString()}";
Content-Transfer-Encoding: quoted-printable

${request.recentLogEntries.join('\n')}
--${boundary}--`;
      await ses
        .sendRawEmail({
          Destinations: [bugReportEmail],
          RawMessage: {Data: message},
          Source: FROM_EMAIL,
        })
        .promise();
      return {};
    }: HelpReportBugRequest => Promise<HelpReportBugResponse>),
  );
}

function getTimeString(time: string): string {
  return new Date(parseInt(time) * 1000).toString();
}
