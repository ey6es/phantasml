/**
 * Request handlers related to administration.
 *
 * @module server/admin
 * @flow
 */

import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {getSettings as fetchSettings, updateSettings} from './util/database';
import {
  handleQueryRequest,
  handleBodyRequest,
  handleCombinedRequest,
} from './util/handler';
import type {
  ApiRequest,
  AdminGetSettingsRequest,
  AdminGetSettingsResponse,
  AdminPutSettingsRequest,
  AdminPutSettingsResponse,
  AdminInviteRequest,
  AdminInviteResponse,
} from './api';
import {
  AdminGetSettingsRequestType,
  AdminPutSettingsRequestType,
  AdminInviteRequestType,
} from './api';
import {getBugReportEmail} from './help';
import {inviteEmail, requireSessionUser} from './user';

export function getSettings(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    AdminGetSettingsRequestType,
    (async request => {
      const [user, settings] = await Promise.all([
        requireAdmin(request),
        fetchSettings(),
      ]);
      return {
        allowAnonymous:
          settings && settings.allowAnonymous && settings.allowAnonymous.BOOL,
        canCreateUser:
          settings && settings.canCreateUser && settings.canCreateUser.BOOL,
        bugReportEmail: getBugReportEmail(settings),
      };
    }: AdminGetSettingsRequest => Promise<AdminGetSettingsResponse>),
  );
}

export function putSettings(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleCombinedRequest(
    event,
    AdminPutSettingsRequestType,
    (async request => {
      await requireAdmin(request);
      await updateSettings({
        allowAnonymous: {BOOL: request.allowAnonymous},
        canCreateUser: {BOOL: request.canCreateUser},
        bugReportEmail: request.bugReportEmail
          ? {S: request.bugReportEmail}
          : null,
      });
      return {};
    }: AdminPutSettingsRequest => Promise<AdminPutSettingsResponse>),
  );
}

export function invite(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    AdminInviteRequestType,
    (async request => {
      await requireAdmin(request);
      await Promise.all(
        request.addresses.map(address => inviteEmail(address, request.locale)),
      );
      return {};
    }: AdminInviteRequest => Promise<AdminInviteResponse>),
  );
}

async function requireAdmin(request: ApiRequest): Promise<Object> {
  const user = await requireSessionUser(request);
  if (!(user.admin && user.admin.BOOL)) {
    throw new Error('Non-admin attempted access: ' + user.id.S);
  }
  return user;
}
