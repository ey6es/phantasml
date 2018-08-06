/**
 * Request handlers related to administration.
 *
 * @module server/admin
 * @flow
 */

import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {getSettings as fetchSettings, updateSettings} from './util/database';
import {handleQueryRequest, handleCombinedRequest} from './util/handler';
import type {
  ApiRequest,
  GetAdminSettingsRequest,
  GetAdminSettingsResponse,
  PutAdminSettingsRequest,
  PutAdminSettingsResponse,
} from './api';
import {GetAdminSettingsRequestType, PutAdminSettingsRequestType} from './api';
import {requireSessionUser} from './user';

export async function getSettings(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    GetAdminSettingsRequestType,
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
      };
    }: GetAdminSettingsRequest => Promise<GetAdminSettingsResponse>),
  );
}

export async function putSettings(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleCombinedRequest(
    event,
    PutAdminSettingsRequestType,
    (async request => {
      await requireAdmin(request);
      await updateSettings({
        allowAnonymous: {BOOL: request.allowAnonymous},
        canCreateUser: {BOOL: request.canCreateUser},
      });
      return {};
    }: PutAdminSettingsRequest => Promise<PutAdminSettingsResponse>),
  );
}

async function requireAdmin(request: ApiRequest): Promise<Object> {
  const user = await requireSessionUser(request);
  if (!(user.admin && user.admin.BOOL)) {
    throw new Error('Non-admin attempted access: ' + user.id.S);
  }
  return user;
}
