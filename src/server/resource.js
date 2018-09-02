/**
 * Request handlers related to resources.
 *
 * @module server/resource
 * @flow
 */

import {S3} from 'aws-sdk';
import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {dynamodb, createUuid, nowInSeconds, updateItem} from './util/database';
import {
  FriendlyError,
  handleBodyRequest,
  handleQueryRequest,
  handleRedirectRequest,
  handleCombinedRequest,
} from './util/handler';
import type {
  IdRequest,
  ResourceType,
  ResourceDescriptor,
  ResourceListRequest,
  ResourceListResponse,
  ResourceCreateRequest,
  ResourceCreateResponse,
  ResourceGetMetadataRequest,
  ResourceGetMetadataResponse,
  ResourcePutMetadataRequest,
  ResourcePutMetadataResponse,
  ResourceGetContentRequest,
  ResourceGetContentResponse,
  ResourcePutContentRequest,
  ResourcePutContentResponse,
  ResourceDeleteRequest,
  ResourceDeleteResponse,
} from './api';
import {
  ResourceListRequestType,
  ResourceCreateRequestType,
  ResourceGetMetadataRequestType,
  ResourcePutMetadataRequestType,
  ResourceGetContentRequestType,
  ResourcePutContentRequestType,
  ResourceDeleteRequestType,
} from './api';
import {getSession, requireSession, requireSessionUser} from './user';
import {isResourceNameValid, isResourceDescriptionValid} from './constants';

const s3 = new S3();

/** The bucket in which we store resources. */
const RESOURCE_BUCKET = process.env.RESOURCE_BUCKET || 'phantasml-resources';

export function list(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    ResourceListRequestType,
    (async request => {
      const session = await getSession(request.authToken);
      if (!session) {
        return {resources: []}; // no anonymous access to resources just yet
      }
      const resources = await dynamodb
        .query({
          TableName: 'Resources',
          IndexName: 'OwnerId',
          KeyConditionExpression: 'ownerId = :v1',
          ExpressionAttributeValues: {
            ':v1': session.userId,
          },
          ScanIndexForward: false,
        })
        .promise();
      return {
        resources: resources.Items.map(createResourceDescriptor),
      };
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
      const session = await requireSession(request.authToken);
      const id = await createResource(session.userId.S, request.type);
      return {id};
    }: ResourceCreateRequest => Promise<ResourceCreateResponse>),
  );
}

async function createResource(
  ownerId: string,
  type: ResourceType,
): Promise<string> {
  const resourceId = createUuid();
  await dynamodb
    .putItem({
      Item: {
        id: {S: resourceId},
        ownerId: {S: ownerId},
        type: {S: type},
        lastOwnerAccessTime: {N: String(nowInSeconds())},
      },
      TableName: 'Resources',
    })
    .promise();
  return resourceId;
}

export function getMetadata(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    ResourceGetMetadataRequestType,
    (async request => {
      const [user, resource] = await requireOwnedResource(request);
      if (user.id.S === resource.ownerId.S) {
        // update last accessed time for owners (not admins)
        updateResource(request.id, {
          lastOwnerAccessTime: {N: String(nowInSeconds())},
        });
      }
      return createResourceDescriptor(resource);
    }: ResourceGetMetadataRequest => Promise<ResourceGetMetadataResponse>),
  );
}

function createResourceDescriptor(item: Object): ResourceDescriptor {
  return {
    id: item.id.S,
    ownerId: item.ownerId.S,
    type: item.type.S,
    lastOwnerAccessTime: item.lastOwnerAccessTime.N,
    name: item.name ? item.name.S : '',
    description: item.description ? item.description.S : '',
  };
}

export function putMetadata(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleCombinedRequest(
    event,
    ResourcePutMetadataRequestType,
    (async request => {
      await requireOwnedResource(request);
      if (!isResourceNameValid(request.name)) {
        throw new Error('Invalid resource name: ' + request.name);
      }
      if (!isResourceDescriptionValid(request.description)) {
        throw new Error('Invalid resource description: ' + request.description);
      }
      await updateResource(request.id, {
        name: request.name ? {S: request.name} : null,
        description: request.description ? {S: request.description} : null,
      });
      return {};
    }: ResourcePutMetadataRequest => Promise<ResourcePutMetadataResponse>),
  );
}

export function getContent(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleRedirectRequest(
    event,
    ResourceGetContentRequestType,
    (async request => {
      await requireOwnedResource(request);
      return await s3
        .getSignedUrl('getObject', {
          Bucket: RESOURCE_BUCKET,
          Key: request.id,
        })
        .promise();
    }: ResourceGetContentRequest => Promise<string>),
  );
}

export function putContent(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleRedirectRequest(
    event,
    ResourcePutContentRequestType,
    (async request => {
      await requireOwnedResource(request);
      return await s3
        .getSignedUrl('putObject', {
          Bucket: RESOURCE_BUCKET,
          Key: request.id,
        })
        .promise();
    }: ResourcePutContentRequest => Promise<string>),
  );
}

export function deleteResource(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  return handleQueryRequest(
    event,
    ResourceDeleteRequestType,
    (async request => {
      await requireOwnedResource(request);
      await deleteResourceItem(request.id);
      return {};
    }: ResourceDeleteRequest => Promise<ResourceDeleteResponse>),
  );
}

async function requireOwnedResource(
  request: IdRequest,
): Promise<[Object, Object]> {
  const [user, resource] = await Promise.all([
    requireSessionUser(request),
    requireResource(request.id),
  ]);
  if (!(user.id.S === resource.ownerId.S || (user.admin && user.admin.BOOL))) {
    throw new Error(`User ${user.id.S} doesn't own resource: ${request.id}`);
  }
  return [user, resource];
}

async function requireResource(id: string): Promise<Object> {
  const resource = await getResource(id);
  if (!resource) {
    throw new FriendlyError('error.resource');
  }
  return resource;
}

async function getResource(id: string): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {id: {S: id}}, TableName: 'Resources'})
    .promise();
  return result.Item;
}

async function updateResource(id: string, attributes: Object) {
  await updateItem('Resources', {id: {S: id}}, attributes);
}

async function deleteResourceItem(id: string): Promise<void> {
  await dynamodb
    .deleteItem({
      Key: {id: {S: id}},
      TableName: 'Resources',
    })
    .promise();
}
