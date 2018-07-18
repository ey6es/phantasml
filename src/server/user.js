// @flow

import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {getQueryRequest, getBodyRequest, createOkResult} from './util/handler';
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

export async function getStatus(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  const request: UserStatusRequest = getQueryRequest(
    event,
    UserStatusRequestType,
  );
  if (request.authToken) {
  }
  const response: UserStatusResponse = {type: 'anonymous'};
  return createOkResult(response);
}

export async function login(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  const request: UserLoginRequest = getBodyRequest(event, UserLoginRequestType);
  return createOkResult({});
}

export async function logout(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  const request: UserLogoutRequest = getBodyRequest(
    event,
    UserLogoutRequestType,
  );
  return createOkResult({});
}
