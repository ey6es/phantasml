/**
 * Request handlers related to resources.
 *
 * @module server/resource
 * @flow
 */

import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {dynamodb, createUuid} from './util/database';
import {handleBodyRequest} from './util/handler';
import type {ResourceCreateRequest, ResourceCreateResponse} from './api';
import {ResourceCreateRequestType} from './api';

export function create(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    ResourceCreateRequestType,
    (async request => {
      return {id: '...'};
    }: ResourceCreateRequest => Promise<ResourceCreateResponse>),
  );
}
