/**
 * Request handlers related to user management.
 *
 * @module server/user
 * @flow
 */

import {URL} from 'url';
import {randomBytes, createHash} from 'crypto';
import {DynamoDB, SES} from 'aws-sdk';
import uuid from 'uuid/v1';
import React from 'react';
import type {Element} from 'react';
import ReactDOMServer from 'react-dom/server';
import {IntlProvider, FormattedMessage} from 'react-intl';
import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import FB from 'fb';
import {OAuth2Client} from 'google-auth-library';
import {handleQueryRequest, handleBodyRequest} from './util/handler';
import type {
  UserStatusRequest,
  UserStatusResponse,
  UserLoginRequest,
  UserLoginResponse,
  AnonymousResponse,
  UserLogoutRequest,
  UserLogoutResponse,
  UserCreateRequest,
  UserCreateResponse,
  UserSetupRequest,
  UserSetupResponse,
  UserPasswordResetRequest,
  UserPasswordResetResponse,
  UserPasswordRequest,
  UserPasswordResponse,
} from './api';
import {
  UserStatusRequestType,
  UserLoginRequestType,
  UserLogoutRequestType,
  UserCreateRequestType,
  UserSetupRequestType,
  UserPasswordResetRequestType,
  UserPasswordRequestType,
} from './api';

const dynamodb = new DynamoDB();
const ses = new SES();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

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
 * @param [locale='en-US'] the locale in which to send the email.
 * @param [admin=false] if true, invite the user as an admin.
 * @param [fromEmail] the email to send from (if not specified, will be
 * retrieved from environment variables).
 * @param [siteUrl] the site URL, which may be a path relative to the current
 * working directory (if not specified, will be retrieved from environment
 * variables).
 */
export async function inviteEmail(
  email: string,
  locale: string = 'en-US',
  admin?: boolean,
  fromEmail?: string,
  siteUrl?: string,
) {
  await sendLinkEmail(
    email,
    locale,
    <FormattedMessage
      id="invite.subject"
      defaultMessage="Come join me in Phantasml!"
    />,
    url => (
      <FormattedMessage
        id="invite.body.text"
        defaultMessage="Visit {url} to join me."
        values={{url}}
      />
    ),
    url => (
      <FormattedMessage
        id="invite.body.html"
        defaultMessage="Visit {url} to join me."
        values={{url: <a href={url}>{url}</a>}}
      />
    ),
    true,
    admin,
    fromEmail,
    siteUrl,
  );
}

async function sendLinkEmail(
  email: string,
  locale: string,
  subject: Element<FormattedMessage>,
  textBody: (url: string) => Element<FormattedMessage>,
  htmlBody: (url: string) => Element<FormattedMessage>,
  forceCreateUser: boolean = false,
  admin: boolean = false,
  fromEmail: string = process.env.FROM_EMAIL || 'noreply@phantasml.com',
  siteUrl: string = process.env.SITE_URL || 'https://www.phantasml.com',
) {
  // see if they already have an account
  const user = await getUserByExternalId(email);

  // create the user item if necessary
  let userId: string;
  let passwordReset = false;
  if (user) {
    userId = user.id.S;
    if (user.displayName && user.displayName.S) {
      passwordReset = true;
    }
  } else {
    if (!forceCreateUser) {
      const settings = await getSettings();
      if (
        !(settings && settings.canCreateUser && settings.canCreateUser.BOOL)
      ) {
        return;
      }
    }
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
        passwordReset: {BOOL: passwordReset},
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
            Data: renderHtml(htmlBody(url), locale),
          },
          Text: {
            Data: renderText(textBody(url), locale),
          },
        },
        Subject: {
          Data: renderText(subject, locale),
        },
      },
      Source: fromEmail,
    })
    .promise();
}

function renderHtml(element: Element<*>, locale: string): string {
  return ReactDOMServer.renderToStaticMarkup(
    <IntlProvider locale={locale} defaultLocale="en-US">
      {element}
    </IntlProvider>,
  );
}

function renderText(element: Element<*>, locale: string): string {
  return ReactDOMServer.renderToStaticMarkup(
    <IntlProvider
      locale={locale}
      defaultLocale="en-US"
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
              passwordReset:
                session.passwordReset && session.passwordReset.BOOL,
            };
          }
        }
      }
      return await getAnonymousResponse();
    }: UserStatusRequest => Promise<UserStatusResponse>),
  );
}

async function getAnonymousResponse(): Promise<AnonymousResponse> {
  const settings = await getSettings();
  return {
    type: 'anonymous',
    allowAnonymous:
      settings && settings.allowAnonymous && settings.allowAnonymous.BOOL,
    canCreateUser:
      settings && settings.canCreateUser && settings.canCreateUser.BOOL,
  };
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
  return handleBodyRequest(
    event,
    UserLoginRequestType,
    (async request => {
      if (request.type === 'password') {
        const user = await getUserByExternalId(request.email);
        if (
          !(
            user &&
            user.passwordSalt &&
            user.passwordHash &&
            getPasswordHash(user.passwordSalt.B, request.password) ===
              user.passwordHash.S
          )
        ) {
          throw new Error('error.password');
        }
        return {
          type: 'logged-in',
          displayName: user.displayName && user.displayName.S,
        };
      }
      if (request.type === 'facebook') {
        const user = await FB.api('/me', {access_token: request.accessToken});
      }
      if (request.type === 'google') {
        const ticket = await googleClient.verifyIdToken({
          idToken: request.idToken,
          audience: GOOGLE_CLIENT_ID,
        });
      }
      throw new Error('Unknown login type.');
    }: UserLoginRequest => Promise<UserLoginResponse>),
  );
}

async function getUserByExternalId(externalId: string): Promise<?Object> {
  const users = await dynamodb
    .query({
      TableName: 'Users',
      IndexName: 'ExternalId',
      KeyConditionExpression: 'externalId = :v1',
      ExpressionAttributeValues: {
        ':v1': {S: externalId},
      },
    })
    .promise();
  return users.Items[0];
}

function getPasswordHash(salt: Buffer, password: string): string {
  const hash = createHash('sha256');
  hash.update(salt);
  hash.update(password);
  return hash.digest('base64');
}

export async function logout(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserLogoutRequestType,
    (async request => {
      return await getAnonymousResponse();
    }: UserLogoutRequest => Promise<UserLogoutResponse>),
  );
}

export async function create(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserCreateRequestType,
    (async request => {
      await sendLinkEmail(
        request.email,
        request.locale,
        <FormattedMessage
          id="create_user.subject"
          defaultMessage="Welcome to Phantasml!"
        />,
        url => (
          <FormattedMessage
            id="create_user.body.text"
            defaultMessage="Visit {url} to continue the creation process."
            values={{url}}
          />
        ),
        url => (
          <FormattedMessage
            id="create_user.body.html"
            defaultMessage="Visit {url} to continue the creation process."
            values={{url: <a href={url}>{url}</a>}}
          />
        ),
      );
      return {};
    }: UserCreateRequest => Promise<UserCreateResponse>),
  );
}

export async function setup(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserSetupRequestType,
    (async request => {
      return {
        type: 'logged-in',
        displayName: '...',
      };
    }: UserSetupRequest => Promise<UserSetupResponse>),
  );
}

export async function passwordReset(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserPasswordResetRequestType,
    (async request => {
      await sendLinkEmail(
        request.email,
        request.locale,
        <FormattedMessage
          id="password_reset.subject"
          defaultMessage="Phantasml password reset"
        />,
        url => (
          <FormattedMessage
            id="password_reset.body.text"
            defaultMessage="Visit {url} to reset your password."
            values={{url}}
          />
        ),
        url => (
          <FormattedMessage
            id="password_reset.body.html"
            defaultMessage="Visit {url} to reset your password."
            values={{url: <a href={url}>{url}</a>}}
          />
        ),
      );
      return {};
    }: UserPasswordResetRequest => Promise<UserPasswordResetResponse>),
  );
}

export async function password(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserPasswordRequestType,
    (async request => {
      return {};
    }: UserPasswordRequest => Promise<UserPasswordResponse>),
  );
}
