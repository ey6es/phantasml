/**
 * Request handlers related to resources.
 *
 * @module server/resource
 * @flow
 */

import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {dynamodb, createUuid} from './util/database';
import {handleBodyRequest, handleQueryRequest} from './util/handler';
import type {
  ResourceListRequest,
  ResourceListResponse,
  ResourceCreateRequest,
  ResourceCreateResponse,
  ResourceGetRequest,
  ResourceGetResponse,
  ResourcePutRequest,
  ResourcePutResponse,
  ResourceDeleteRequest,
  ResourceDeleteResponse,
} from './api';
import {
  ResourceListRequestType,
  ResourceCreateRequestType,
  ResourceGetRequestType,
  ResourcePutRequestType,
  ResourceDeleteRequestType,
} from './api';

export function list(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    ResourceListRequestType,
    (async request => {
      return {};
    }: ResourceListRequest => Promise<ResourceListResponse>),
  );
}

export function create(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    ResourceCreateRequestType,
    (async request => {
      const id = createUuid();
      return {id};
    }: ResourceCreateRequest => Promise<ResourceCreateResponse>),
  );
}

export function get(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    ResourceGetRequestType,
    (async request => {
      return {};
    }: ResourceGetRequest => Promise<ResourceGetResponse>),
  );
}

export function put(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    ResourcePutRequestType,
    (async request => {
      return {};
    }: ResourcePutRequest => Promise<ResourcePutResponse>),
  );
}

export function deleteResource(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleBodyRequest(
    event,
    ResourceDeleteRequestType,
    (async request => {
      return {};
    }: ResourceDeleteRequest => Promise<ResourceDeleteResponse>),
  );
}
