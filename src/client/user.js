/**
 * Components related to user management.
 *
 * @module client/user
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Form, FormGroup, Label, Input, Modal} from 'reactstrap';
import {postToApi} from './util/api';
import {RequestDialog} from './util/ui';
import type {UserLoginRequest, LoggedInResponse} from '../server/api';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  isEmailValid,
  isPasswordValid,
} from '../server/constants';

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

  _getErrorMessage(error: Error): ?React.Element<FormattedMessage> {
    if (error.message === 'error.password') {
      return (
        <FormattedMessage
          id="error.password"
          defaultMessage="The email/password combination entered is invalid."
        />
      );
    }
  }

  _onClosed = (response: ?LoggedInResponse) => {
    response && this.props.setUserStatus(response);
  };

  render() {
    const emailValid = isEmailValid(this.state.email);
    const passwordValid = isPasswordValid(this.state.password);
    return (
      <RequestDialog
        header={<FormattedMessage id="login.title" defaultMessage="Login" />}
        makeRequest={this._makeRequest}
        invalid={!(emailValid && passwordValid)}
        getErrorMessage={this._getErrorMessage}
        onClosed={this._onClosed}
        cancelable={this.props.cancelable}>
        <Form>
          <FormGroup>
            <Label for="email">
              <FormattedMessage id="login.email" defaultMessage="Email" />
            </Label>
            <Input
              type="email"
              id="email"
              value={this.state.email}
              valid={emailValid}
              onInput={event => this.setState({email: event.target.value})}
            />
          </FormGroup>
          <FormGroup>
            <Label for="password">
              <FormattedMessage id="login.password" defaultMessage="Password" />
            </Label>
            <Input
              type="password"
              id="password"
              value={this.state.password}
              valid={passwordValid}
              onInput={event => this.setState({password: event.target.value})}
            />
          </FormGroup>
        </Form>
      </RequestDialog>
    );
  }
}

export function AcceptInviteDialog(props: {}) {
  return <Modal />;
}

export function PasswordResetDialog(props: {}) {
  return <Modal />;
}
