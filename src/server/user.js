/**
 * Request handlers related to user management.
 *
 * @module server/user
 * @flow
 */

import {URL} from 'url';
import {randomBytes, createHash} from 'crypto';
import {SES} from 'aws-sdk';
import uuid from 'uuid/v1';
import React from 'react';
import type {Element} from 'react';
import ReactDOMServer from 'react-dom/server';
import {IntlProvider, FormattedMessage} from 'react-intl';
import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import FB from 'fb';
import {OAuth2Client} from 'google-auth-library';
import {dynamodb, updateItem, getSettings} from './util/database';
import {
  SITE_URL,
  FROM_EMAIL,
  FriendlyError,
  handleQueryRequest,
  handleBodyRequest,
} from './util/handler';
import type {
  ApiRequest,
  UserStatusRequest,
  UserStatusResponse,
  ExternalLoginRequest,
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
import {isDisplayNameValid} from './constants';

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
  fromEmail: string = FROM_EMAIL,
  siteUrl: string = SITE_URL,
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
      if (!(await getCanCreateUser())) {
        return;
      }
    }
    userId = await createUser(email, '', getGravatarUrl(email), admin);
  }

  // create the invite session
  const token = await createSession(userId, true, passwordReset);

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

function getGravatarUrl(email: string) {
  const hash = createHash('md5');
  hash.update(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash.digest('hex')}?d=retro`;
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
              externalId: user.externalId.S,
              displayName: user.displayName && user.displayName.S,
              imageUrl: user.imageUrl && user.imageUrl.S,
              passwordReset:
                session.passwordReset && session.passwordReset.BOOL,
              admin: user.admin && user.admin.BOOL,
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

async function getCanCreateUser(): Promise<?boolean> {
  const settings = await getSettings();
  return settings && settings.canCreateUser && settings.canCreateUser.BOOL;
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
          throw new FriendlyError('error.password');
        }
        const imageUrl = user.imageUrl && user.imageUrl.S;
        const gravatarUrl = getGravatarUrl(request.email);
        if (imageUrl !== gravatarUrl) {
          updateUser(user.id.S, {imageUrl: {S: gravatarUrl}});
        }
        const token = await createSession(user.id.S, request.stayLoggedIn);
        return {
          type: 'logged-in',
          externalId: user.externalId.S,
          authToken: token,
          persistAuthToken: request.stayLoggedIn,
          displayName: user.displayName && user.displayName.S,
          imageUrl: gravatarUrl,
          admin: user.admin && user.admin.BOOL,
        };
      }
      const [externalId, displayName, imageUrl] = await getExternalLogin(
        request,
      );
      let userId: string;
      let admin: ?boolean;
      let user = await getUserByExternalId(externalId);
      if (user) {
        userId = user.id.S;
        admin = user.admin && user.admin.BOOL;
        if (
          user.displayName.S !== displayName ||
          user.imageUrl.S !== imageUrl
        ) {
          updateUser(userId, {
            displayName: {S: displayName},
            imageUrl: {S: imageUrl},
          });
        }
      } else {
        if (!(await getCanCreateUser())) {
          throw new FriendlyError('error.create_user');
        }
        userId = await createUser(externalId, displayName, imageUrl);
      }
      const token = await createSession(userId);
      return {
        type: 'logged-in',
        externalId,
        authToken: token,
        displayName,
        imageUrl,
        admin,
      };
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

async function createUser(
  externalId: string,
  displayName: string = '',
  imageUrl: string = '',
  admin: boolean = false,
): Promise<string> {
  const userId = createUuid();
  await dynamodb
    .putItem({
      Item: {
        id: {S: userId},
        externalId: {S: externalId},
        displayName: {S: displayName},
        imageUrl: {S: imageUrl},
        admin: {BOOL: admin},
      },
      TableName: 'Users',
    })
    .promise();
  return userId;
}

async function updateUser(userId: string, attributes: Object) {
  await updateItem('Users', {id: {S: userId}}, attributes);
}

export async function logout(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserLogoutRequestType,
    (async request => {
      await dynamodb
        .deleteItem({
          Key: {token: {S: request.authToken}},
          TableName: 'Sessions',
        })
        .promise();
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
      const user = await requireSessionUser(request);
      const userId = user.id.S;
      let externalId: string;
      let displayName: string;
      let imageUrl: string;
      let persistAuthToken = false;
      if (request.type === 'password') {
        if (!isDisplayNameValid(request.displayName)) {
          throw new Error('Invalid display name: ' + request.displayName);
        }
        const email = user.externalId.S;
        [externalId, displayName, imageUrl, persistAuthToken] = [
          email,
          request.displayName,
          getGravatarUrl(email),
          request.stayLoggedIn,
        ];
        await updateUser(userId, {
          displayName: {S: displayName},
          imageUrl: {S: imageUrl},
          ...getPasswordAttributes(request.password),
        });
      } else {
        [externalId, displayName, imageUrl] = await getExternalLogin(request);
        await updateUser(userId, {
          externalId: {S: externalId},
          displayName: {S: displayName},
          imageUrl: {S: imageUrl},
        });
      }
      const token = await createSession(userId, persistAuthToken);
      return {
        type: 'logged-in',
        authToken: token,
        persistAuthToken,
        externalId,
        displayName,
        imageUrl,
        admin: user.admin && user.admin.BOOL,
      };
    }: UserSetupRequest => Promise<UserSetupResponse>),
  );
}

async function getExternalLogin(
  request: ExternalLoginRequest,
): Promise<[string, string, string]> {
  if (request.type === 'facebook') {
    const user = await FB.api('/me', {access_token: request.accessToken});
    return [`facebook:${user.id}`, user.first_name, user.profile_pic];
  } else {
    // request.type === 'google'
    const ticket = await googleClient.verifyIdToken({
      idToken: request.idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return [`google:${payload.sub}`, payload.given_name, payload.picture];
  }
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
      const session = await requireSession(request.authToken);
      const userId = session.userId.S;
      const [user, result, token] = await Promise.all([
        requireUser(userId),
        updateUser(userId, getPasswordAttributes(request.password)),
        createSession(userId, request.stayLoggedIn),
      ]);
      return {
        type: 'logged-in',
        authToken: token,
        persistAuthToken: request.stayLoggedIn,
        externalId: user.externalId.S,
        displayName: user.displayName.S,
        imageUrl: getGravatarUrl(user.externalId.S),
        admin: user.admin && user.admin.BOOL,
      };
    }: UserPasswordRequest => Promise<UserPasswordResponse>),
  );
}

/**
 * Retrieves the user record for the request, throwing an exception if there
 * isn't one.
 *
 * @param request the current request.
 * @return a promise that will resolve to the user record.
 */
export async function requireSessionUser(request: ApiRequest): Promise<Object> {
  const session = await requireSession(request.authToken);
  return await requireUser(session.userId.S);
}

async function requireSession(token: ?string): Promise<Object> {
  if (!token) {
    throw new Error('Missing token.');
  }
  const session = await getSession(token);
  if (!session) {
    throw new FriendlyError('error.expired');
  }
  return session;
}

async function getSession(token: string): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {token: {S: token}}, TableName: 'Sessions'})
    .promise();
  return result.Item;
}

async function requireUser(id: string): Promise<Object> {
  const user = await getUser(id);
  if (!user) {
    throw new Error('Missing user: ' + id);
  }
  return user;
}

async function getUser(id: string): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {id: {S: id}}, TableName: 'Users'})
    .promise();
  return result.Item;
}

async function createSession(
  userId: string,
  persistent: boolean = false,
  passwordReset: boolean = false,
): Promise<string> {
  const token = createToken();
  const daysUntilExpiration = persistent ? 365 : 7;
  await dynamodb
    .putItem({
      Item: {
        token: {S: token},
        userId: {S: userId},
        passwordReset: {BOOL: passwordReset},
        expirationTime: {
          N: String(nowInSeconds() + daysUntilExpiration * 24 * 60 * 60),
        },
      },
      TableName: 'Sessions',
    })
    .promise();
  return token;
}

function nowInSeconds(): number {
  return Math.round(Date.now() / 1000);
}

function getPasswordAttributes(password: string): Object {
  const salt = randomBytes(16);
  return {
    passwordSalt: {B: salt},
    passwordHash: {S: getPasswordHash(salt, password)},
  };
}

function getPasswordHash(salt: Buffer, password: string): string {
  const hash = createHash('sha256');
  hash.update(salt);
  hash.update(password);
  return hash.digest('base64');
}
