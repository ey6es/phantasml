/**
 * Components related to user management.
 *
 * @module client/user
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Modal} from 'reactstrap';
import {postToApi} from './util/api';
import {RequestDialog} from './util/ui';
import type {UserLoginRequest, LoggedInResponse} from '../server/api';

/**
 * A dialog used for logging in.
 */
export class LoginDialog extends React.Component<
  {
    canCreateUser: ?boolean,
    setUserStatus: LoggedInResponse => void,
    cancelable?: boolean,
  },
  {email: string, password: string},
> {
  state = {email: '', password: ''};

  _makeRequest = async () => {
    const request: UserLoginRequest = {
      type: 'password',
      email: this.state.email,
      password: this.state.password,
    };
    return await postToApi('/user/login', request);
  };

  _onClosed = (response: ?LoggedInResponse) => {
    response && this.props.setUserStatus(response);
  };

  render() {
    return (
      <RequestDialog
        header={<FormattedMessage id="login.title" defaultMessage="Login" />}
        makeRequest={this._makeRequest}
        onClosed={this._onClosed}
        cancelable={this.props.cancelable}
      />
    );
  }
}

export function AcceptInviteDialog(props: {}) {
  return <Modal />;
}

export function PasswordResetDialog(props: {}) {
  return <Modal />;
}
