/**
 * Request handlers related to user management.
 *
 * @module server/user
 * @flow
 */

import {URL} from 'url';
import {randomBytes} from 'crypto';
import {DynamoDB, SES} from 'aws-sdk';
import uuid from 'uuid/v1';
import React from 'react';
import type {Element} from 'react';
import ReactDOMServer from 'react-dom/server';
import {IntlProvider, FormattedMessage} from 'react-intl';
import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {handleQueryRequest, handleBodyRequest} from './util/handler';
import type {
  UserStatusRequest,
  UserStatusResponse,
  UserLoginRequest,
  UserLoginResponse,
  UserLogoutRequest,
  UserLogoutResponse,
} from './api';
import {
  UserStatusRequestType,
  UserLoginRequestType,
  UserLogoutRequestType,
} from './api';

const dynamodb = new DynamoDB();
const ses = new SES();

/**
 * Creates and returns a random auth token.
 *
 * @return the newly created token.
 */
function createToken(): string {
  return randomBytes(18).toString('base64');
}

/**
 * Creates and returns a base64 UUID with URL-safe characters.
 *
 * @return the newly created UUID.
 */
function createUuid() {
  const base = uuid({}, Buffer.alloc(16), 0).toString('base64');
  // only 22 characters will be valid; the final two will be ==
  return base
    .substring(0, 22)
    .replace(/[+/]/g, char => (char === '+' ? '-' : '_'));
}

/**
 * Sends an email invitation to the provided address.
 *
 * @param email the email to send to.
 * @param [locale='en'] the locale in which to send the email.
 * @param [admin=false] if true, invite the user as an admin.
 * @param [fromEmail] the email to send from (if not specified, will be
 * retrieved from environment variables).
 * @param [siteUrl] the site URL, which may be a path relative to the current
 * working directory (if not specified, will be retrieved from environment
 * variables).
 */
export async function inviteEmail(
  email: string,
  locale: string = 'en',
  admin: boolean = false,
  fromEmail: string = process.env.FROM_EMAIL || 'noreply@phantasml.com',
  siteUrl: string = process.env.SITE_URL || 'https://www.phantasml.com',
) {
  // see if they already have an account
  const users = await dynamodb
    .query({
      TableName: 'Users',
      IndexName: 'ExternalId',
      KeyConditionExpression: 'externalId = :v1',
      ExpressionAttributeValues: {
        ':v1': {S: email},
      },
      ProjectionExpression: 'id',
    })
    .promise();

  // create the user item if necessary
  let userId: string;
  if (users.Items.length > 0) {
    userId = users.Items[0].id.S;
  } else {
    userId = createUuid();
    await dynamodb
      .putItem({
        Item: {
          id: {S: userId},
          externalId: {S: email},
          admin: {BOOL: admin},
        },
        TableName: 'Users',
      })
      .promise();
  }

  // create the invite session
  const token = createToken();
  await dynamodb
    .putItem({
      Item: {
        token: {S: token},
        userId: {S: userId},
        invite: {BOOL: true},
      },
      TableName: 'Sessions',
    })
    .promise();

  // send the email
  const url = new URL(
    siteUrl + `?t=${encodeURIComponent(token)}`,
    `file://${process.cwd()}/`,
  ).toString();
  await ses
    .sendEmail({
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Body: {
          Html: {
            Data: renderHtml(
              <FormattedMessage
                id="invite.body.html"
                defaultMessage="Visit {url} to join me."
                values={{url: <a href={url}>{url}</a>}}
              />,
              locale,
            ),
          },
          Text: {
            Data: renderText(
              <FormattedMessage
                id="invite.body.text"
                defaultMessage="Visit {url} to join me."
                values={{url}}
              />,
              locale,
            ),
          },
        },
        Subject: {
          Data: renderText(
            <FormattedMessage
              id="invite.subject"
              defaultMessage="Come join me in Phantasml!"
            />,
            locale,
          ),
        },
      },
      Source: fromEmail,
    })
    .promise();
}

function renderHtml(element: Element<*>, locale: string): string {
  return ReactDOMServer.renderToStaticMarkup(
    <IntlProvider locale={locale}>{element}</IntlProvider>,
  );
}

function renderText(element: Element<*>, locale: string): string {
  return ReactDOMServer.renderToStaticMarkup(
    <IntlProvider
      locale={locale}
      textComponent={(props: {children: string}) => props.children}>
      {element}
    </IntlProvider>,
  );
}

export async function getStatus(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    UserStatusRequestType,
    (async request => {
      if (request.authToken) {
        const session = await getSession(request.authToken);
        if (session) {
          const user = await getUser(session.userId.S);
          if (user) {
            return {
              type: 'logged-in',
              displayName: user.displayName && user.displayName.S,
              invite: session.invite && session.invite.BOOL,
              passwordReset:
                session.passwordReset && session.passwordReset.BOOL,
            };
          }
        }
      }
      const settings = await getSettings();
      return {
        type: 'anonymous',
        allowAnonymous:
          settings && settings.allowAnonymous && settings.allowAnonymous.BOOL,
        canCreateUser:
          settings && settings.canCreateUser && settings.canCreateUser.BOOL,
      };
    }: UserStatusRequest => Promise<UserStatusResponse>),
  );
}

async function getSession(token: string): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {token: {S: token}}, TableName: 'Sessions'})
    .promise();
  return result.Item;
}

async function getUser(id: string): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {id: {S: id}}, TableName: 'Users'})
    .promise();
  return result.Item;
}

async function getSettings(id: string = 'site'): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {id: {S: id}}, TableName: 'Users'})
    .promise();
  return result.Item;
}

export async function login(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(event, UserLogoutRequestType, async request => {
    throw new Error('testing');
  });
}

export async function logout(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(event, UserLogoutRequestType, async request => {
    return {};
  });
}
