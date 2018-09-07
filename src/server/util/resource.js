/**
 * Resource utility functions.
 *
 * @module server/util/resource
 * @flow
 */

import {S3} from 'aws-sdk';
import {dynamodb, updateItem} from './database';

export const s3 = new S3();

/** The bucket in which we store resources. */
export const RESOURCE_BUCKET =
  process.env.RESOURCE_BUCKET || 'phantasml-resources';

/**
 * Transfers all resources owned by the identified user to a new user.
 *
 * @param oldUserId the original user id.
 * @param newUserId the new user id.
 * @return a promise that will resolve when finished.
 */
export async function transferAllOwnedResources(
  oldUserId: string,
  newUserId: string,
): Promise<void> {
  await forAllOwnedResources(oldUserId, async items => {
    for (const item of items) {
      // TODO: batch these to whatever extent makes sense
      await updateItem('Resources', {id: item.id}, {ownerId: {S: newUserId}});
    }
  });
}

/**
 * Deletes all resources owned by the identified user.
 *
 * @param userId the id of the user whose resources are to be deleted.
 * @return a promise that will resolve when finished.
 */
export async function deleteAllOwnedResources(userId: string): Promise<void> {
  await forAllOwnedResources(userId, async items => {
    await Promise.all([
      dynamodb
        .batchWriteItem({
          RequestItems: {
            Resources: items.map(item => ({
              DeleteRequest: {Key: {id: item.id}},
            })),
          },
        })
        .promise(),
      s3
        .deleteObjects({
          Bucket: RESOURCE_BUCKET,
          Delete: {
            Objects: items.map(item => ({Key: item.id})),
            Quiet: true,
          },
        })
        .promise(),
    ]);
  });
}

async function forAllOwnedResources(
  userId: string,
  op: (Object[]) => Promise<void>,
): Promise<void> {
  let ExclusiveStartKey: ?Object;
  do {
    const BATCH_WRITE_LIMIT = 25;
    const resources = await dynamodb
      .query({
        TableName: 'Resources',
        IndexName: 'OwnerId',
        Select: 'SPECIFIC_ATTRIBUTES',
        KeyConditionExpression: 'ownerId = :v1',
        ExpressionAttributeValues: {':v1': {S: userId}},
        Limit: BATCH_WRITE_LIMIT,
        ProjectionExpression: 'id',
        ExclusiveStartKey,
      })
      .promise();
    if (resources.Items.length > 0) {
      await op(resources.Items);
    }
    ExclusiveStartKey = resources.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}
