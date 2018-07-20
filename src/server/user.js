// @flow

import {randomBytes} from 'crypto';
import {DynamoDB, SES} from 'aws-sdk';
import uuid from 'uuid/v1';
import {defineMessages} from 'react-intl';
import type {APIGatewayEvent, Context, ProxyResult} from 'flow-aws-lambda';
import {getQueryRequest, getBodyRequest, createOkResult} from './util/handler';
import type {
  UserStatusRequest,
  UserStatusResponse,
  UserLoginRequest,
  UserLoginResponse,
  UserLogoutRequest,
  UserLogoutResponse,
} from './api';
import {
  UserStatusRequestType,
  UserLoginRequestType,
  UserLogoutRequestType,
} from './api';

const dynamodb = new DynamoDB();
const ses = new SES();

/**
 * Creates and returns a random auth token.
 *
 * @return the newly created token.
 */
function createToken(): string {
  return randomBytes(18).toString('base64');
}

/**
 * Sends an email invitation to the provided address.
 *
 * @param email the email to send to.
 * @param [admin=false] if true, invite the user as an admin.
 */
export async function inviteEmail(email: string, admin: boolean = false) {
  // see if they already have an account
  const users = await dynamodb
    .query({
      TableName: 'Users',
      IndexName: 'ExternalId',
      KeyConditionExpression: 'externalId = :v1',
      ExpressionAttributeValues: {
        ':v1': {S: email},
      },
      ProjectionExpression: 'id',
    })
    .toPromise();

  // create the user item if necessary
  let userId: string;
  if (users.Items.length > 0) {
    userId = users.Items[0].id;
  } else {
    userId = uuid();
    await dynamodb
      .putItem({
        Item: {
          id: {S: userId},
          externalId: {S: email},
          admin: {BOOL: admin},
        },
        TableName: 'Users',
      })
      .toPromise();
  }

  // create the invite session
  const token = createToken();
  await dynamodb
    .putItem({
      Item: {
        token: {S: token},
        userId: {S: userId},
        invite: {BOOL: true},
      },
      TableName: 'Sessions',
    })
    .toPromise();

  // send the email
  await ses
    .sendEmail({
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Body: {
          Html: {
            Data: '',
          },
          Text: {
            Data: '',
          },
        },
        Subject: {
          Data: '',
        },
      },
      Source: '',
    })
    .toPromise();
}

export async function getStatus(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  const request: UserStatusRequest = getQueryRequest(
    event,
    UserStatusRequestType,
  );
  if (request.authToken) {
  }
  const response: UserStatusResponse = {type: 'anonymous'};
  return createOkResult(response);
}

export async function login(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  const request: UserLoginRequest = getBodyRequest(event, UserLoginRequestType);
  return createOkResult({});
}

export async function logout(
  event: APIGatewayEvent,
  context: Context,
): Promise<ProxyResult> {
  const request: UserLogoutRequest = getBodyRequest(
    event,
    UserLogoutRequestType,
  );
  return createOkResult({});
}
