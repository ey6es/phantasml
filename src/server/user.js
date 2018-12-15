/**
 * Request handlers related to user management.
 *
 * @module server/user
 * @flow
 */

import {URL} from 'url';
import {randomBytes, createHash} from 'crypto';
import React from 'react';
import type {Element} from 'react';
import {FormattedMessage} from 'react-intl';
import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import FB from 'fb';
import {OAuth2Client} from 'google-auth-library';
import {
  dynamodb,
  createUuid,
  updateItem,
  getSettings,
  updateSettings,
  nowInSeconds,
} from './util/database';
import {FROM_EMAIL, ses, renderHtml, renderText} from './util/email';
import {
  SITE_URL,
  FriendlyError,
  handleQueryRequest,
  handleBodyRequest,
  handleCombinedRequest,
} from './util/handler';
import {
  transferAllOwnedResources,
  deleteAllOwnedResources,
} from './util/resource';
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
  UserConfigureRequest,
  UserConfigureResponse,
  UserTransferRequest,
  UserTransferResponse,
  UserCompleteTransferRequest,
  UserCompleteTransferResponse,
  UserDeleteRequest,
  UserDeleteResponse,
  UserGetPreferencesRequest,
  UserGetPreferencesResponse,
  UserPutPreferencesRequest,
  UserPutPreferencesResponse,
} from './api';
import {
  UserStatusRequestType,
  UserLoginRequestType,
  UserLogoutRequestType,
  UserCreateRequestType,
  UserSetupRequestType,
  UserPasswordResetRequestType,
  UserPasswordRequestType,
  UserConfigureRequestType,
  UserTransferRequestType,
  UserCompleteTransferRequestType,
  UserDeleteRequestType,
  UserGetPreferencesRequestType,
  UserPutPreferencesRequestType,
} from './api';
import {collapseWhitespace, isDisplayNameValid} from './constants';

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
    null,
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
  transferUserId: ?string,
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
    if (user.displayName && user.displayName.S && !transferUserId) {
      passwordReset = true;
    }
  } else {
    if (!forceCreateUser) {
      if (!(await getCanCreateUser())) {
        return;
      }
    }
    userId = await createUser(email, null, getGravatarUrl(email), admin);
  }

  // create the invite session
  const token = await createSession(
    userId,
    true,
    passwordReset,
    transferUserId,
  );

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

export function getStatus(
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
              userId: user.id.S,
              externalId: user.externalId.S,
              displayName: user.displayName && user.displayName.S,
              imageUrl: user.imageUrl && user.imageUrl.S,
              passwordReset:
                session.passwordReset && session.passwordReset.BOOL,
              transfer: session.transferUserId && !!session.transferUserId.S,
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

export function login(
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
          userId: user.id.S,
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
        userId,
        externalId,
        authToken: token,
        displayName,
        imageUrl,
        admin,
      };
    }: UserLoginRequest => Promise<UserLoginResponse>),
  );
}

/**
 * Retrieves a user item by external id (e.g., email address).
 *
 * @param externalId the external id to find.
 * @return a promise that will resolve to the user item, if any.
 */
export async function getUserByExternalId(
  externalId: string,
): Promise<?Object> {
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
  displayName: ?string,
  imageUrl: ?string,
  admin: boolean = false,
): Promise<string> {
  const userId = createUuid();
  await dynamodb
    .putItem({
      Item: {
        id: {S: userId},
        externalId: {S: externalId},
        displayName: displayName ? {S: displayName} : undefined,
        imageUrl: imageUrl ? {S: imageUrl} : undefined,
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

export function logout(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserLogoutRequestType,
    (async request => {
      await deleteSession(request.authToken);
      return await getAnonymousResponse();
    }: UserLogoutRequest => Promise<UserLogoutResponse>),
  );
}

export function create(
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

export function setup(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserSetupRequestType,
    (async request => {
      let user = await requireSessionUser(request);
      let userId = user.id.S;
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
          collapseWhitespace(request.displayName),
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
        const existingUser = await getUserByExternalId(externalId);
        if (existingUser) {
          // if the authenticated user already exists, delete the original user
          // and transfer the session
          await Promise.all([
            deleteUserItem(userId),
            updateItem(
              'Sessions',
              {token: {S: request.authToken}},
              {userId: {S: existingUser.id.S}},
            ),
          ]);
          user = existingUser;
          userId = existingUser.id.S;
        }
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
        userId,
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
    const user = await FB.api('/me?fields=first_name,picture', {
      access_token: request.accessToken,
    });
    return [`facebook:${user.id}`, user.first_name, user.picture.data.url];
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

export function passwordReset(
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

export function password(
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
        userId,
        externalId: user.externalId.S,
        displayName: user.displayName.S,
        imageUrl: getGravatarUrl(user.externalId.S),
        admin: user.admin && user.admin.BOOL,
      };
    }: UserPasswordRequest => Promise<UserPasswordResponse>),
  );
}

export function configure(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserConfigureRequestType,
    (async request => {
      const user = await requireSessionUser(request);
      if (!isDisplayNameValid(request.displayName)) {
        throw new Error('Invalid display name: ' + request.displayName);
      }
      const displayName = collapseWhitespace(request.displayName);
      await updateUser(user.id.S, {
        displayName: {S: displayName},
        ...(request.password ? getPasswordAttributes(request.password) : {}),
      });
      return {
        type: 'logged-in',
        userId: user.id.S,
        externalId: user.externalId.S,
        displayName: displayName,
        imageUrl: getGravatarUrl(user.externalId.S),
        admin: user.admin && user.admin.BOOL,
      };
    }: UserConfigureRequest => Promise<UserConfigureResponse>),
  );
}

export function transfer(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserTransferRequestType,
    (async request => {
      let user = await requireSessionUser(request);
      let userId = user.id.S;
      if (request.type === 'email') {
        await sendLinkEmail(
          request.email,
          request.locale,
          <FormattedMessage
            id="transfer.subject"
            defaultMessage="Phantasml account transfer"
          />,
          url => (
            <FormattedMessage
              id="transfer.body.text"
              defaultMessage="Visit {url} to transfer your account."
              values={{url}}
            />
          ),
          url => (
            <FormattedMessage
              id="transfer.body.html"
              defaultMessage="Visit {url} to transfer your account."
              values={{url: <a href={url}>{url}</a>}}
            />
          ),
          userId,
          true,
        );
        return {type: 'email'};
      }
      let admin = user.admin && user.admin.BOOL;
      const [externalId, displayName, imageUrl] = await getExternalLogin(
        request,
      );
      const existingUser = await getUserByExternalId(externalId);
      if (existingUser) {
        // if the authenticated user already exists, delete the original user
        // and transfer the session
        await transferAllOwnedResources(userId, existingUser.id.S);
        await Promise.all([
          deleteUserItem(userId),
          updateItem(
            'Sessions',
            {token: {S: request.authToken}},
            {userId: {S: existingUser.id.S}},
          ),
        ]);
        user = existingUser;
        userId = existingUser.id.S;
        admin = admin || (existingUser.admin && existingUser.admin.BOOL);
      }
      await updateUser(userId, {
        externalId: {S: externalId},
        displayName: {S: displayName},
        imageUrl: {S: imageUrl},
        admin: {BOOL: !!admin},
      });
      return {
        type: 'logged-in',
        userId,
        externalId,
        displayName,
        imageUrl,
        admin,
      };
    }: UserTransferRequest => Promise<UserTransferResponse>),
  );
}

export function completeTransfer(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserCompleteTransferRequestType,
    (async request => {
      const session = await requireSession(request.authToken);
      if (!(session.transferUserId && session.transferUserId.S)) {
        throw new Error('Invalid transfer session.');
      }
      const [user, originalUser] = await Promise.all([
        requireUser(session.userId.S),
        requireUser(session.transferUserId.S),
      ]);
      const admin =
        (originalUser.admin && originalUser.admin.BOOL) ||
        (user.admin && user.admin.BOOL);
      await transferAllOwnedResources(originalUser.id.S, user.id.S);
      await Promise.all([
        updateUser(user.id.S, {
          displayName: originalUser.displayName,
          admin: {BOOL: !!admin},
          ...getPasswordAttributes(request.password),
        }),
        deleteUserItem(originalUser.id.S),
        updateItem(
          'Sessions',
          {token: {S: request.authToken}},
          {transferUserId: null},
        ),
      ]);
      const token = await createSession(user.id.S, request.stayLoggedIn);
      return {
        type: 'logged-in',
        authToken: token,
        persistAuthToken: request.stayLoggedIn,
        userId: user.id.S,
        externalId: user.externalId.S,
        displayName: originalUser.displayName.S,
        imageUrl: getGravatarUrl(user.externalId.S),
        admin,
      };
    }: UserCompleteTransferRequest => Promise<UserCompleteTransferResponse>),
  );
}

export function deleteUser(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    UserDeleteRequestType,
    (async request => {
      const session = await requireSession(request.authToken);
      await deleteAllOwnedResources(session.userId.S);
      await deleteUserItem(session.userId.S);
      await deleteSession(request.authToken);
      return await getAnonymousResponse();
    }: UserDeleteRequest => Promise<UserDeleteResponse>),
  );
}

async function deleteUserItem(id: string): Promise<void> {
  await dynamodb
    .deleteItem({
      Key: {id: {S: id}},
      TableName: 'Users',
    })
    .promise();
}

export function getPreferences(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    UserGetPreferencesRequestType,
    (async request => {
      const session = await requireSession(request.authToken);
      const preferences = await getSettings(session.userId.S);
      if (!preferences) {
        return {};
      }
      return {
        autoSaveMinutes:
          preferences.autoSaveMinutes &&
          parseInt(preferences.autoSaveMinutes.N),
        showStats: preferences.showStats && preferences.showStats.BOOL,
        gridSnap: preferences.gridSnap && preferences.gridSnap.BOOL,
        featureSnap: preferences.featureSnap && preferences.featureSnap.BOOL,
        local: preferences.local && preferences.local.BOOL,
        snap: preferences.snap && preferences.snap.BOOL,
        radius: preferences.radius && parseFloat(preferences.radius.N),
        thickness: preferences.thickness && parseFloat(preferences.thickness.N),
        pathColor: preferences.pathColor && preferences.pathColor.S,
        dynamic: preferences.dynamic && preferences.dynamic.BOOL,
        loop: preferences.loop && preferences.loop.BOOL,
        fillColor: preferences.fillColor && preferences.fillColor.S,
        fill: preferences.fill && preferences.fill.BOOL,
        unlinkScale: preferences.unlinkScale && preferences.unlinkScale.BOOL,
      };
    }: UserGetPreferencesRequest => Promise<UserGetPreferencesResponse>),
  );
}

export function putPreferences(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleCombinedRequest(
    event,
    UserPutPreferencesRequestType,
    (async request => {
      const session = await requireSession(request.authToken);
      const settings = {};
      if (request.autoSaveMinutes != null) {
        settings.autoSaveMinutes = {N: String(request.autoSaveMinutes)};
      }
      if (request.showStats != null) {
        settings.showStats = {BOOL: request.showStats};
      }
      if (request.gridSnap != null) {
        settings.gridSnap = {BOOL: request.gridSnap};
      }
      if (request.featureSnap != null) {
        settings.featureSnap = {BOOL: request.featureSnap};
      }
      if (request.local != null) {
        settings.local = {BOOL: request.local};
      }
      if (request.snap != null) {
        settings.snap = {BOOL: request.snap};
      }
      if (request.radius != null) {
        settings.radius = {N: String(request.radius)};
      }
      if (request.thickness != null) {
        settings.thickness = {N: String(request.thickness)};
      }
      if (request.pathColor != null) {
        settings.pathColor = {S: request.pathColor};
      }
      if (request.dynamic != null) {
        settings.dynamic = {BOOL: request.dynamic};
      }
      if (request.loop != null) {
        settings.loop = {BOOL: request.loop};
      }
      if (request.fillColor != null) {
        settings.fillColor = {S: request.fillColor};
      }
      if (request.fill != null) {
        settings.fill = {BOOL: request.fill};
      }
      if (request.unlinkScale != null) {
        settings.unlinkScale = {BOOL: request.unlinkScale};
      }
      await updateSettings(settings, session.userId.S);
      return {};
    }: UserPutPreferencesRequest => Promise<UserPutPreferencesResponse>),
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

/**
 * Retrieves the session record for the auth token, throwing an exception if
 * there isn't one.
 *
 * @param token the request token.
 * @return a promise that will resolve to the session record.
 */
export async function requireSession(token: ?string): Promise<Object> {
  if (!token) {
    throw new Error('Missing token.');
  }
  const session = await getSession(token);
  if (!session) {
    throw new FriendlyError('error.expired');
  }
  return session;
}

/**
 * Retrieves the session record for the auth token, if any.
 *
 * @param token the request token.
 * @return a promise that will resolve to the session record, if any.
 */
export async function getSession(token: ?string): Promise<?Object> {
  if (!token) {
    return null;
  }
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

export async function getUser(id: string): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {id: {S: id}}, TableName: 'Users'})
    .promise();
  return result.Item;
}

async function createSession(
  userId: string,
  persistent: boolean = false,
  passwordReset: ?boolean,
  transferUserId: ?string,
): Promise<string> {
  const token = createToken();
  const daysUntilExpiration = persistent ? 365 : 7;
  await dynamodb
    .putItem({
      Item: {
        token: {S: token},
        userId: {S: userId},
        passwordReset: passwordReset ? {BOOL: true} : undefined,
        transferUserId: transferUserId ? {S: transferUserId} : undefined,
        expirationTime: {
          N: String(nowInSeconds() + daysUntilExpiration * 24 * 60 * 60),
        },
      },
      TableName: 'Sessions',
    })
    .promise();
  return token;
}

async function deleteSession(token: ?string): Promise<void> {
  if (!token) {
    throw new Error('Missing token');
  }
  await dynamodb
    .deleteItem({
      Key: {token: {S: token}},
      TableName: 'Sessions',
    })
    .promise();
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
