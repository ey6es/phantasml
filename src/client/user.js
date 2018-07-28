/**
 * Components related to user management.
 *
 * @module client/user
 * @flow
 */

import * as React from 'react';
import {FormattedMessage, injectIntl} from 'react-intl';
import {
  Form,
  FormGroup,
  Label,
  Input,
  CustomInput,
  Container,
  Row,
  Col,
  Modal,
} from 'reactstrap';
import {metatags, postToApi} from './util/api';
import {RequestDialog} from './util/ui';
import type {UserLoginRequest, LoggedInResponse} from '../server/api';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  isEmailValid,
  isPasswordValid,
} from '../server/constants';

declare var gapi: any;
declare var FB: any;

FB.init({
  appId: metatags.get('facebook-app-id'),
  version: 'v3.1',
});

/**
 * A dialog used for logging in.
 */
export class LoginDialog extends React.Component<
  {
    canCreateUser: ?boolean,
    setUserStatus: LoggedInResponse => void,
    cancelable?: boolean,
  },
  {email: string, password: string, stayLoggedIn: boolean},
> {
  state = {email: '', password: '', stayLoggedIn: false};

  _makeRequest = async () => {
    const request: UserLoginRequest = {
      type: 'password',
      email: this.state.email,
      password: this.state.password,
      stayLoggedIn: this.state.stayLoggedIn,
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
          <FormGroup>
            <LabeledCheckbox
              className="text-center"
              id="stayLoggedIn"
              checked={this.state.stayLoggedIn}
              onChange={event =>
                this.setState({stayLoggedIn: event.target.checked})
              }
              label={
                <FormattedMessage
                  id="login.stay_logged_in"
                  defaultMessage="Stay logged in"
                />
              }
            />
          </FormGroup>
        </Form>
        <Container>
          <Row noGutters className="justify-content-between">
            <Col md="auto">
              <div ref={this._renderGoogleButton} />
            </Col>
            <Col md="auto">
              <div
                ref={this._renderFacebookButton}
                className="fb-login-button"
                data-size="large"
                data-button-type="login_with"
              />
            </Col>
          </Row>
        </Container>
      </RequestDialog>
    );
  }

  _renderGoogleButton = (element: ?HTMLDivElement) => {
    element &&
      gapi.signin2.render(element, {
        longtitle: true,
        theme: 'dark',
        height: 40,
      });
  };

  _renderFacebookButton = (element: ?HTMLDivElement) => {
    element && FB.XFBML.parse(element.parentElement);
  };
}

const LabeledCheckbox = injectIntl((props: Object) => {
  return (
    <CustomInput
      type="checkbox"
      {...props}
      label={props.intl.formatMessage(
        props.label.props,
        props.label.props.values,
      )}
    />
  );
});

export function AcceptInviteDialog(props: {}) {
  return <Modal />;
}

export function PasswordResetDialog(props: {}) {
  return <Modal />;
}
