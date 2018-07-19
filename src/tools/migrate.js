// @flow

import {DynamoDB} from 'aws-sdk';

const dynamodb = new DynamoDB();

const TABLES = [
  {
    TableName: 'Sessions',
  },
  {
    TableName: 'Users',
  },
];

/**
 * Performs all necessary migrations, including creating and seeding tables.
 */
export default async function migrate() {
  // create any missing tables
  for (const table of TABLES) {
  }
}
