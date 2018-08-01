/**
 * Request handler utility functions.
 *
 * @module server/util/handler
 * @flow
 */

import type {APIGatewayEvent, ProxyResult} from 'flow-aws-lambda';
import type {Type} from 'flow-runtime';

/**
 * Marker class for errors that will be communicated to the client.
 *
 * @param id the translation id of the error.
 * @param [statusCode=400] the error status code.
 */
export class FriendlyError extends Error {
  statusCode: number;

  constructor(id: string, statusCode: number = 400) {
    super(id);
    this.statusCode = statusCode;
  }
}

/**
 * Wraps a handler function for a query request, returning an OK result if it
 * returns successfully or an error result if it throws an exception.
 *
 * @param event the gateway event.
 * @param runtimeRequestType the runtime type of the request.
 * @param handler the handler to wrap.
 * @return a promise that will resolve to the result.
 */
export async function handleQueryRequest<
  RequestType: Object,
  ResponseType: Object,
>(
  event: APIGatewayEvent,
  runtimeRequestType: Type<RequestType>,
  handler: RequestType => Promise<ResponseType>,
): Promise<ProxyResult> {
  try {
    const response = await handler(getQueryRequest(event, runtimeRequestType));
    return createOkResult(response);
  } catch (error) {
    return createErrorResult(error);
  }
}

/**
 * Retrieves the request object from the query of a request.
 *
 * @param event the gateway event.
 * @param runtimeType the runtime type of the request.
 * @return the parsed request.
 */
function getQueryRequest<T: Object>(
  event: APIGatewayEvent,
  runtimeType: Type<T>,
): T {
  const request: T = (event.queryStringParameters || {}: any);
  runtimeType.assert(request);
  return request;
}

/**
 * Wraps a handler function for a body request, returning an OK result if it
 * returns successfully or an error result if it throws an exception.
 *
 * @param event the gateway event.
 * @param runtimeRequestType the runtime type of the request.
 * @param handler the handler to wrap.
 * @return a promise that will resolve to the result.
 */
export async function handleBodyRequest<
  RequestType: Object,
  ResponseType: Object,
>(
  event: APIGatewayEvent,
  runtimeRequestType: Type<RequestType>,
  handler: RequestType => Promise<ResponseType>,
): Promise<ProxyResult> {
  try {
    const response = await handler(getBodyRequest(event, runtimeRequestType));
    return createOkResult(response);
  } catch (error) {
    return createErrorResult(error);
  }
}

/**
 * Retrieves the request object from the body of a request.
 *
 * @param event the gateway event.
 * @param runtimeType the runtime type of the request.
 * @return the parsed request.
 */
function getBodyRequest<T: Object>(
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
function createOkResult<T: Object>(body: T): ProxyResult {
  return createResult(200, body);
}

/**
 * Creates and returns a simple error result.
 *
 * @param error the error object.
 * @return the error result.
 */
function createErrorResult(error: Error): ProxyResult {
  if (error instanceof FriendlyError) {
    return createResult(error.statusCode, {error: error.message});
  } else {
    console.warn(error);
    return createResult(500, {error: 'error.server'});
  }
}

/**
 * Creates and returns a simple result with a JSON body.
 *
 * @param body the object representing the body of the result.
 * @return the result.
 */
function createResult(statusCode: number, body: Object): ProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
