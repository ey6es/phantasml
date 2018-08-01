/**
 * API types shared between client and server.
 *
 * @module server/api
 * @flow
 */

// flow-runtime doesn't recognize this in the module comment
// @flow-runtime enable

import t, {reify} from 'flow-runtime';
import type {Type} from 'flow-runtime';

type ApiRequest = {authToken?: string};

export type UserStatusRequest = ApiRequest;
export const UserStatusRequestType = (reify: Type<UserStatusRequest>);
export type AnonymousResponse = {
  type: 'anonymous',
  allowAnonymous: ?boolean,
  canCreateUser: ?boolean,
};
export type LoggedInResponse = {
  type: 'logged-in',
  externalId: string,
  displayName: ?string,
  passwordReset?: ?boolean,
};
export type UserStatusResponse = AnonymousResponse | LoggedInResponse;

type PasswordLoginRequest = ApiRequest & {
  type: 'password',
  email: string,
  password: string,
  stayLoggedIn: boolean,
};
type GoogleLoginRequest = ApiRequest & {
  type: 'google',
  idToken: string,
};
type FacebookLoginRequest = ApiRequest & {
  type: 'facebook',
  accessToken: string,
};
export type UserLoginRequest =
  | PasswordLoginRequest
  | GoogleLoginRequest
  | FacebookLoginRequest;
export const UserLoginRequestType = (reify: Type<UserLoginRequest>);
export type UserLoginResponse = LoggedInResponse;

export type UserLogoutRequest = ApiRequest;
export const UserLogoutRequestType = (reify: Type<UserLogoutRequest>);
export type UserLogoutResponse = AnonymousResponse;

export type UserCreateRequest = ApiRequest & {email: string, locale: string};
export const UserCreateRequestType = (reify: Type<UserCreateRequest>);
export type UserCreateResponse = {};

type PasswordSetupRequest = ApiRequest & {
  type: 'password',
  displayName: string,
  password: string,
};
export type UserSetupRequest =
  | PasswordSetupRequest
  | GoogleLoginRequest
  | FacebookLoginRequest;
export const UserSetupRequestType = (reify: Type<UserSetupRequest>);
export type UserSetupResponse = LoggedInResponse;

export type UserPasswordResetRequest = ApiRequest & {
  email: string,
  locale: string,
};
export const UserPasswordResetRequestType = (reify: Type<
  UserPasswordResetRequest,
>);
export type UserPasswordResetResponse = {};

export type UserPasswordRequest = ApiRequest & {password: string};
export const UserPasswordRequestType = (reify: Type<UserPasswordRequest>);
export type UserPasswordResponse = {};
