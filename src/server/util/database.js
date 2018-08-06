/**
 * Database utility functions.
 *
 * @module server/util/database
 * @flow
 */

import {DynamoDB} from 'aws-sdk';

/** The shared DynamoDB instance. */
export const dynamodb = new DynamoDB();

/**
 * Retrieves a settings record from the database.
 *
 * @param [id='site'] the id of the settings record to retrieve.
 * @return a promise that will resolve to the settings record, if found.
 */
export async function getSettings(id: string = 'site'): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {id: {S: id}}, TableName: 'Settings'})
    .promise();
  return result.Item;
}

/**
 * Updates a settings record in the database.
 *
 * @param attributes the object containing the attributes to set.
 * @param [id='site'] the id of the settings record to update.
 * @return a promise that will resolve when finished.
 */
export async function updateSettings(
  attributes: Object,
  id: string = 'site',
): Promise<void> {
  await updateItem('Settings', {id: {S: id}}, attributes);
}

/**
 * Creates/updates an item in DynamoDB.
 *
 * @param TableName the name of the table to update.
 * @param Key the primary key.
 * @param attributes the object containing the attributes to set.
 * @return a promise that will resolve when finished.
 */
export async function updateItem(
  TableName: string,
  Key: Object,
  attributes: Object,
): Promise<void> {
  let ExpressionAttributeNames = {};
  let ExpressionAttributeValues = {};
  let UpdateExpression = '';
  for (const key in attributes) {
    ExpressionAttributeNames['#' + key] = key;
    ExpressionAttributeValues[':' + key] = attributes[key];
    if (UpdateExpression) {
      UpdateExpression += ',';
    } else {
      UpdateExpression = 'SET';
    }
    UpdateExpression += ` #${key} = :${key}`;
  }
  await dynamodb
    .updateItem({
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      Key,
      TableName,
      UpdateExpression,
    })
    .promise();
}
