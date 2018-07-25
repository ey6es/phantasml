/**
 * API types shared between client and server.
 *
 * @module server/api
 * @flow
 * @flow-runtime enable
 */

import t, {reify} from 'flow-runtime';
import type {Type} from 'flow-runtime';

type ApiRequest = {authToken?: string};

export type UserStatusRequest = ApiRequest;
export const UserStatusRequestType = (reify: Type<UserStatusRequest>);

type AnonymousResponse = {
  type: 'anonymous',
  allowAnonymous: ?boolean,
  canCreateUser: ?boolean,
};
type LoggedInResponse = {
  type: 'logged-in',
  displayName: ?string,
  invite: ?boolean,
  passwordReset: ?boolean,
};
export type UserStatusResponse = AnonymousResponse | LoggedInResponse;

type PasswordLoginRequest = ApiRequest & {
  type: 'password',
  email: string,
  password: string,
};
type FacebookLoginRequest = ApiRequest & {
  type: 'facebook',
  accessToken: string,
};
export type UserLoginRequest = PasswordLoginRequest | FacebookLoginRequest;
export const UserLoginRequestType = (reify: Type<UserLoginRequest>);

type InvalidLoginResponse = {type: 'invalid-login'};
export type UserLoginResponse = LoggedInResponse | InvalidLoginResponse;

export type UserLogoutRequest = ApiRequest;
export const UserLogoutRequestType = (reify: Type<UserLogoutRequest>);

export type UserLogoutResponse = AnonymousResponse;
