// @flow

import type {APIGatewayEvent, ProxyResult} from 'flow-aws-lambda';
import type {Type} from 'flow-runtime';

/**
 * Retrieves the request object from the query of a request.
 *
 * @param event the gateway event.
 * @param runtimeType the runtime type of the request.
 * @return the parsed request.
 */
export function getQueryRequest<T: Object>(
  event: APIGatewayEvent,
  runtimeType: Type<T>,
): T {
  const request: T = (event.queryStringParameters || {}: any);
  runtimeType.assert(request);
  return request;
}

/**
 * Retrieves the request object from the body of a request.
 *
 * @param event the gateway event.
 * @param runtimeType the runtime type of the request.
 * @return the parsed request.
 */
export function getBodyRequest<T: Object>(
  event: APIGatewayEvent,
  runtimeType: Type<T>,
): T {
  const request: T = JSON.parse(event.body || '');
  runtimeType.assert(request);
  return request;
}

/**
 * Creates and returns a simple OK result with a JSON body.
 *
 * @param body the object representing the body of the result.
 * @return the OK result.
 */
export function createOkResult<T: Object>(body: T): ProxyResult {
  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  };
}
