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
import {RESOURCE_TYPES} from './constants';

export type ApiRequest = {authToken?: string};
export type IdRequest = ApiRequest & {id: string};

export type UserStatusRequest = ApiRequest;
export const UserStatusRequestType = (reify: Type<UserStatusRequest>);
export type AnonymousResponse = {
  type: 'anonymous',
  allowAnonymous: ?boolean,
  canCreateUser: ?boolean,
};
export type LoggedInResponse = {
  type: 'logged-in',
  userId: string,
  externalId: string,
  authToken?: string,
  persistAuthToken?: boolean,
  displayName: ?string,
  imageUrl: ?string,
  admin: ?boolean,
  passwordReset?: ?boolean,
  transfer?: ?boolean,
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
export type ExternalLoginRequest = GoogleLoginRequest | FacebookLoginRequest;
export type UserLoginRequest = PasswordLoginRequest | ExternalLoginRequest;
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
  stayLoggedIn: boolean,
};
export type UserSetupRequest = PasswordSetupRequest | ExternalLoginRequest;
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

export type UserPasswordRequest = ApiRequest & {
  password: string,
  stayLoggedIn: boolean,
};
export const UserPasswordRequestType = (reify: Type<UserPasswordRequest>);
export type UserPasswordResponse = LoggedInResponse;

export type UserConfigureRequest = ApiRequest & {
  displayName: string,
  password: string,
};
export const UserConfigureRequestType = (reify: Type<UserConfigureRequest>);
export type UserConfigureResponse = LoggedInResponse;

type EmailTransferRequest = ApiRequest & {
  type: 'email',
  email: string,
  locale: string,
};
export type UserTransferRequest = EmailTransferRequest | ExternalLoginRequest;
export const UserTransferRequestType = (reify: Type<UserTransferRequest>);
export type UserTransferResponse = LoggedInResponse | {type: 'email'};

export type UserCompleteTransferRequest = UserPasswordRequest;
export const UserCompleteTransferRequestType = (reify: Type<
  UserCompleteTransferRequest,
>);
export type UserCompleteTransferResponse = LoggedInResponse;

export type UserDeleteRequest = ApiRequest;
export const UserDeleteRequestType = (reify: Type<UserDeleteRequest>);
export type UserDeleteResponse = AnonymousResponse;

export type UserGetPreferencesRequest = ApiRequest;
export const UserGetPreferencesRequestType = (reify: Type<
  UserGetPreferencesRequest,
>);
type PreferencesData = {
  autoSaveMinutes?: ?number,
  showStats?: ?boolean,
  gridSnap?: ?boolean,
  featureSnap?: ?boolean,
  local?: ?boolean,
  snap?: ?boolean,
  radius?: ?number,
  thickness?: ?number,
  pathColor?: ?string,
  dynamic?: ?boolean,
  loop?: ?boolean,
  fillColor?: ?string,
  fill?: ?boolean,
  unlinkScale?: ?boolean,
};
export type UserGetPreferencesResponse = PreferencesData;

export type UserPutPreferencesRequest = ApiRequest & PreferencesData;
export const UserPutPreferencesRequestType = (reify: Type<
  UserPutPreferencesRequest,
>);
export type UserPutPreferencesResponse = {};

export type AdminGetSettingsRequest = ApiRequest;
export const AdminGetSettingsRequestType = (reify: Type<
  AdminGetSettingsRequest,
>);
export type AdminGetSettingsResponse = {
  allowAnonymous: ?boolean,
  canCreateUser: ?boolean,
  bugReportEmail: ?string,
};

export type AdminPutSettingsRequest = ApiRequest & {
  allowAnonymous: boolean,
  canCreateUser: boolean,
  bugReportEmail: string,
};
export const AdminPutSettingsRequestType = (reify: Type<
  AdminPutSettingsRequest,
>);
export type AdminPutSettingsResponse = {};

export type AdminInviteRequest = ApiRequest & {
  addresses: string[],
  locale: string,
};
export const AdminInviteRequestType = (reify: Type<AdminInviteRequest>);
export type AdminInviteResponse = {};

export type ResourceType = $Keys<typeof RESOURCE_TYPES>;

type ResourceMetadata = {name: string, description: string};
export type ResourceDescriptor = ResourceMetadata & {
  id: string,
  ownerId: string,
  type: ResourceType,
  lastOwnerAccessTime: string,
};

export type ResourceListRequest = ApiRequest;
export const ResourceListRequestType = (reify: Type<ResourceListRequest>);
export type ResourceListResponse = {resources: ResourceDescriptor[]};

export type ResourceCreateRequest = ApiRequest & {type: ResourceType};
export const ResourceCreateRequestType = (reify: Type<ResourceCreateRequest>);
export type ResourceCreateResponse = {id: string};

export type ResourceGetMetadataRequest = IdRequest;
export const ResourceGetMetadataRequestType = (reify: Type<
  ResourceGetMetadataRequest,
>);
export type ResourceGetMetadataResponse = ResourceDescriptor;

export type ResourcePutMetadataRequest = IdRequest & ResourceMetadata;
export const ResourcePutMetadataRequestType = (reify: Type<
  ResourcePutMetadataRequest,
>);
export type ResourcePutMetadataResponse = {};

export type ResourceGetContentRequest = IdRequest;
export const ResourceGetContentRequestType = (reify: Type<
  ResourceGetContentRequest,
>);
export type ResourceGetContentResponse = {};

export type ResourcePutContentRequest = IdRequest;
export const ResourcePutContentRequestType = (reify: Type<
  ResourcePutContentRequest,
>);
export type ResourcePutContentResponse = {};

export type ResourceDeleteRequest = IdRequest;
export const ResourceDeleteRequestType = (reify: Type<ResourceDeleteRequest>);
export type ResourceDeleteResponse = {};

export type HelpReportBugRequest = ApiRequest & {
  description: string,
  userAgent: string,
  url: string,
  buildTime: string,
  recentLogEntries: string[],
  stats: ?{[string]: number},
  screenshot: ?string,
};
export const HelpReportBugRequestType = (reify: Type<HelpReportBugRequest>);
export type HelpReportBugResponse = {};
