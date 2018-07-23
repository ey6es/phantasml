// @flow
// @flow-runtime enable

import t, {reify} from 'flow-runtime';
import type {Type} from 'flow-runtime';

type ApiRequest = {authToken?: string};

export type UserStatusRequest = ApiRequest;
export const UserStatusRequestType = (reify: Type<UserStatusRequest>);

type AnonymousResponse = {type: 'anonymous'};
type LoginRequiredResponse = {type: 'login-required', canCreate: boolean};
type AcceptInviteResponse = {type: 'accept-invite'};
type LoggedInResponse = {
  type: 'logged-in',
  displayName: string,
  resetPassword?: boolean,
};
export type UserStatusResponse =
  | AnonymousResponse
  | LoginRequiredResponse
  | AcceptInviteResponse
  | LoggedInResponse;

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

export type UserLogoutResponse = AnonymousResponse | LoginRequiredResponse;
