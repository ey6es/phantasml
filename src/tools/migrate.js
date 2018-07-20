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
 */
export default async function migrate(firstAdminEmail?: string) {
  // get the list of tables
  const tableList = await dynamodb.listTables().toPromise();
  const tableNames = new Set(tableList.TableNames);

  // create missing tables, update existing ones
  for (const table of TABLES) {
    if (!tableNames.has(table.TableName)) {
      console.log(`Creating table ${table.TableName}`);
      await dynamodb.createTable(table).toPromise();
      await dynamodb
        .waitFor('tableExists', {TableName: table.TableName})
        .toPromise();

      // seed table if appropriate
      if (table.TableName === 'Users' && firstAdminEmail) {
        await inviteEmail(firstAdminEmail, true);
      }
    }
  }
}
