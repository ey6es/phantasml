// @flow

import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import type {SessionRequest, SessionResponse} from '../shared/api';

export async function handler(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  const request: SessionRequest = JSON.parse(event.body || '');
  const response: SessionResponse = {};
  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(response),
  };
}
