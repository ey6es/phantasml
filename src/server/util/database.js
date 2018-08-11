/**
 * Database utility functions.
 *
 * @module server/util/database
 * @flow
 */

import {DynamoDB} from 'aws-sdk';
import uuid from 'uuid/v1';
import {SITE_URL} from './handler';

/** The shared DynamoDB instance. */
export const dynamodb = new DynamoDB();

/**
 * Creates and returns a base64 UUID with URL-safe characters.
 *
 * @return the newly created UUID.
 */
export function createUuid() {
  const base = uuid({}, Buffer.alloc(16), 0).toString('base64');
  // only 22 characters will be valid; the final two will be ==
  return base
    .substring(0, 22)
    .replace(/[+/]/g, char => (char === '+' ? '-' : '_'));
}

/**
 * Retrieves a settings record from the database.
 *
 * @param [id=SITE_URL] the id of the settings record to retrieve.
 * @return a promise that will resolve to the settings record, if found.
 */
export async function getSettings(id: string = SITE_URL): Promise<?Object> {
  const result = await dynamodb
    .getItem({Key: {id: {S: id}}, TableName: 'Settings'})
    .promise();
  return result.Item;
}

/**
 * Updates a settings record in the database.
 *
 * @param attributes the object containing the attributes to set.
 * @param [id=SITE_URL] the id of the settings record to update.
 * @return a promise that will resolve when finished.
 */
export async function updateSettings(
  attributes: Object,
  id: string = SITE_URL,
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
  let ExpressionAttributeValues: ?Object;
  let setExpression = '';
  let removeExpression = '';
  for (const key in attributes) {
    ExpressionAttributeNames['#' + key] = key;
    const value = attributes[key];
    if (value) {
      if (!ExpressionAttributeValues) {
        ExpressionAttributeValues = {};
      }
      ExpressionAttributeValues[':' + key] = value;
      if (setExpression) {
        setExpression += ',';
      } else {
        setExpression = 'SET';
      }
      setExpression += ` #${key} = :${key}`;
    } else {
      if (removeExpression) {
        removeExpression += ',';
      } else {
        removeExpression = 'REMOVE';
      }
      removeExpression += ` #${key}`;
    }
  }
  await dynamodb
    .updateItem({
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      Key,
      TableName,
      UpdateExpression:
        setExpression +
        (setExpression && removeExpression ? ' ' : '') +
        removeExpression,
    })
    .promise();
}
