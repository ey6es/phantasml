// @flow

import {DynamoDB} from 'aws-sdk';
import {inviteEmail} from '../server/user';

const dynamodb = new DynamoDB();

const TABLES = [
  {
    TableName: 'Sessions',
    AttributeDefinitions: [
      {
        AttributeName: 'token',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'token',
        KeyType: 'HASH',
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  },
  {
    TableName: 'Users',
    AttributeDefinitions: [
      {
        AttributeName: 'id',
        AttributeType: 'S',
      },
      {
        AttributeName: 'externalId',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'id',
        KeyType: 'HASH',
      },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ExternalId',
        KeySchema: [
          {
            AttributeName: 'externalId',
            KeyType: 'HASH',
          },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  },
];

/**
 * Performs all necessary migrations, including creating and seeding tables.
 *
 * @param firstAdminEmail the email address of the first admin user to create,
 * if the user table doesn't yet exist.
 * @param fromEmail the email address to send from.
 * @param siteUrl the site URL, which may be a path relative to the current
 * working directory.
 */
export default async function migrate(
  firstAdminEmail: string,
  fromEmail: string,
  siteUrl: string,
) {
  // get the list of tables
  const tableList = await dynamodb.listTables().promise();
  const tableNames = new Set(tableList.TableNames);

  // create missing tables, update existing ones
  for (const table of TABLES) {
    if (!tableNames.has(table.TableName)) {
      console.log(`Creating table ${table.TableName}`);
      await dynamodb.createTable(table).promise();
      await dynamodb
        .waitFor('tableExists', {TableName: table.TableName})
        .promise();

      // seed table if appropriate
      if (table.TableName === 'Users') {
        console.log('Creating and sending initial admin invite');
        await inviteEmail(firstAdminEmail, 'en', true, fromEmail, siteUrl);
      }
    }
  }
}
