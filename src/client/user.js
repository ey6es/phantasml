/**
 * Components related to user management.
 *
 * @module client/user
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {
  Form,
  FormGroup,
  Label,
  Input,
  Container,
  Row,
  Col,
  Modal,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
} from 'reactstrap';
import {metatags, postToApi} from './util/api';
import {RequestDialog, LabeledCheckbox} from './util/ui';
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

type LoginDialogTab = 'sign_in' | 'create_user' | 'forgot_password';

/**
 * A dialog used for logging in.
 */
export class LoginDialog extends React.Component<
  {
    canCreateUser: ?boolean,
    setUserStatus: LoggedInResponse => void,
    cancelable?: boolean,
  },
  {
    activeTab: LoginDialogTab,
    email: string,
    password: string,
    stayLoggedIn: boolean,
    seenError: ?Error,
  },
> {
  state = {
    activeTab: 'sign_in',
    email: '',
    password: '',
    stayLoggedIn: false,
    seenError: null,
  };

  _lastError: ?Error;

  render() {
    const Tab = (props: {id: LoginDialogTab, children: mixed}) => (
      <NavItem>
        <NavLink
          active={props.id === this.state.activeTab}
          onClick={() => this._setInputState({activeTab: props.id})}>
          {props.children}
        </NavLink>
      </NavItem>
    );
    return (
      <RequestDialog
        header={<FormattedMessage id="login.title" defaultMessage="Login" />}
        makeRequest={this._makeRequest}
        invalid={
          !(
            isEmailValid(this.state.email) &&
            (this.state.activeTab !== 'sign_in' ||
              isPasswordValid(this.state.password))
          )
        }
        getErrorMessage={this._getErrorMessage}
        seenError={this.state.seenError}
        onClosed={this._onClosed}
        cancelable={this.props.cancelable}>
        <Nav tabs>
          <Tab id="sign_in">
            <FormattedMessage id="login.sign_in" defaultMessage="Sign in" />
          </Tab>
          {/* this.props.canCreateUser */ true ? (
            <Tab id="create_user">
              <FormattedMessage
                id="login.create_user"
                defaultMessage="Create account"
              />
            </Tab>
          ) : null}
          <Tab id="forgot_password">
            <FormattedMessage
              id="login.forgot_password"
              defaultMessage="Forgot password?"
            />
          </Tab>
        </Nav>
        <TabContent activeTab={this.state.activeTab}>
          {this._renderSignInPane()}
          {this._renderCreateUserPane()}
          {this._renderForgotPasswordPane()}
        </TabContent>
        <Container>
          <div className="text-center login-or">
            — <FormattedMessage id="login.or" defaultMessage="or" /> —
          </div>
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

  _setInputState(state: Object) {
    this.setState(Object.assign({seenError: this._lastError}, state));
  }

  _makeRequest = async () => {
    const request: UserLoginRequest = {
      type: 'password',
      email: this.state.email,
      password: this.state.password,
      stayLoggedIn: this.state.stayLoggedIn,
    };
    return await postToApi('/user/login', request);
  };

  _getErrorMessage = (error: Error) => {
    this._lastError = error;
    if (error.message === 'error.password') {
      return (
        <FormattedMessage
          id="error.password"
          defaultMessage="The email/password combination entered is invalid."
        />
      );
    }
  };

  _onClosed = (response: ?LoggedInResponse) => {
    response && this.props.setUserStatus(response);
  };

  _renderSignInPane() {
    return (
      <TabPane tabId="sign_in">
        <Form>
          {this._renderEmail()}
          <FormGroup>
            <Label for="password">
              <FormattedMessage id="login.password" defaultMessage="Password" />
            </Label>
            <Input
              type="password"
              id="password"
              value={this.state.password}
              valid={isPasswordValid(this.state.password)}
              onInput={event =>
                this._setInputState({password: event.target.value})
              }
            />
          </FormGroup>
          <LabeledCheckbox
            className="text-center"
            id="stayLoggedIn"
            checked={this.state.stayLoggedIn}
            onChange={event =>
              this._setInputState({stayLoggedIn: event.target.checked})
            }
            label={
              <FormattedMessage
                id="login.stay_logged_in"
                defaultMessage="Stay logged in"
              />
            }
          />
        </Form>
      </TabPane>
    );
  }

  _renderCreateUserPane() {
    return (
      <TabPane tabId="create_user">
        <Form>
          <FormGroup className="text-center">
            <FormattedMessage
              id="login.create_user.text"
              defaultMessage={`
                Enter your email address below and click OK.  We'll send you an
                email containing a link you can use to create your account.
              `}
            />
          </FormGroup>
          {this._renderEmail()}
        </Form>
      </TabPane>
    );
  }

  _renderForgotPasswordPane() {
    return (
      <TabPane tabId="forgot_password">
        <Form>
          <FormGroup className="text-center">
            <FormattedMessage
              id="login.forgot_password.text"
              defaultMessage={`
                Enter your email address below and click OK.  We'll send you an
                email containing a link you can use to reset your password.
              `}
            />
          </FormGroup>
          {this._renderEmail()}
        </Form>
      </TabPane>
    );
  }

  _renderEmail() {
    return (
      <FormGroup>
        <Label for="email">
          <FormattedMessage id="login.email" defaultMessage="Email" />
        </Label>
        <Input
          type="email"
          id="email"
          value={this.state.email}
          valid={isEmailValid(this.state.email)}
          onInput={event => this._setInputState({email: event.target.value})}
        />
      </FormGroup>
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

export function AcceptInviteDialog(props: {}) {
  return <Modal />;
}

export function PasswordResetDialog(props: {}) {
  return <Modal />;
}
