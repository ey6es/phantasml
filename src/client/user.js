/**
 * Components related to user management.
 *
 * @module client/user
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {
  Button,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Form,
  FormGroup,
  FormText,
  Label,
  Input,
  Container,
  Row,
  Col,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
} from 'reactstrap';
import {postToApi} from './util/api';
import {
  RequestDialog,
  ErrorDialog,
  LabeledCheckbox,
  LoadingSpinner,
} from './util/ui';
import type {
  UserLoginRequest,
  LoggedInResponse,
  UserStatusResponse,
  UserCreateRequest,
  UserPasswordResetRequest,
  UserPasswordRequest,
  UserSetupRequest,
} from '../server/api';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  isEmailValid,
  isPasswordValid,
  isDisplayNameValid,
} from '../server/constants';

declare var gapi: any;
declare var FB: any;

type LoginDialogTab = 'sign_in' | 'create_user' | 'forgot_password';

/**
 * A dialog used for logging in or requesting user creation or password reset.
 *
 * @param props.canCreateUser whether we currently allow creating new users.
 * @param props.setUserStatus the function used to set the user properties in
 * the containing context.
 * @param cancelable whether the user can close the dialog without logging in.
 * @param onClose an optional function to call when the dialog is closed.
 */
export class LoginDialog extends React.Component<
  {
    canCreateUser: ?boolean,
    setUserStatus: LoggedInResponse => void,
    locale: string,
    cancelable?: boolean,
    onClose?: () => void,
  },
  {
    activeTab: LoginDialogTab,
    email: string,
    password: string,
    stayLoggedIn: boolean,
    facebookToken: ?string,
    googleToken: ?string,
    loading: boolean,
  },
> {
  state = {
    activeTab: 'sign_in',
    email: '',
    password: '',
    stayLoggedIn: false,
    facebookToken: null,
    googleToken: null,
    loading: false,
  };

  _submitButton: ?HTMLInputElement;

  render() {
    const Tab = (props: {id: LoginDialogTab, children: mixed}) => (
      <NavItem>
        <NavLink
          active={props.id === this.state.activeTab}
          onClick={() => this.setState({activeTab: props.id})}
          disabled={this.state.loading}>
          {props.children}
        </NavLink>
      </NavItem>
    );
    return (
      <RequestDialog
        header={<FormattedMessage id="login.title" defaultMessage="Log In" />}
        makeRequest={this._makeRequest}
        autoRequest={!!(this.state.facebookToken || this.state.googleToken)}
        invalid={
          !(
            this.state.activeTab === 'sign_in' || isEmailValid(this.state.email)
          )
        }
        getFeedback={this._getFeedback}
        onClosed={this._onClosed}
        cancelable={this.props.cancelable}>
        <Nav tabs>
          <Tab id="sign_in">
            <FormattedMessage id="login.sign_in" defaultMessage="Sign in" />
          </Tab>
          {this.props.canCreateUser ? (
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
        <ExternalButtons
          setGoogleToken={googleToken => this.setState({googleToken})}
          setFacebookToken={facebookToken => this.setState({facebookToken})}
        />
      </RequestDialog>
    );
  }

  _makeRequest = async () => {
    this.setState({loading: true});
    try {
      if (this.state.facebookToken) {
        const request: UserLoginRequest = {
          type: 'facebook',
          accessToken: this.state.facebookToken,
        };
        try {
          return await postToApi('/user/login', request);
        } catch (error) {
          await new Promise(resolve => FB.logout(resolve));
          throw error;
        }
      }
      if (this.state.googleToken) {
        const request: UserLoginRequest = {
          type: 'google',
          idToken: this.state.googleToken,
        };
        try {
          return await postToApi('/user/login', request);
        } catch (error) {
          await gapi.auth2.getAuthInstance().signOut();
          throw error;
        }
      }
      switch (this.state.activeTab) {
        case 'sign_in': {
          const [email, password] = [this.state.email, this.state.password];
          if (!(isEmailValid(email) && isPasswordValid(password))) {
            // don't need to ask the server in this case
            throw new Error('error.password');
          }
          this._submitButton && this._submitButton.click();
          const request: UserLoginRequest = {
            type: 'password',
            email,
            password,
            stayLoggedIn: this.state.stayLoggedIn,
          };
          return await postToApi('/user/login', request);
        }
        case 'create_user': {
          const request: UserCreateRequest = {
            email: this.state.email,
            locale: this.props.locale,
          };
          return [await postToApi('/user/create', request), true];
        }
        case 'forgot_password': {
          const request: UserPasswordResetRequest = {
            email: this.state.email,
            locale: this.props.locale,
          };
          return [await postToApi('/user/password_reset', request), true];
        }
        default:
          throw new Error('Unknown tab');
      }
    } finally {
      this.setState({loading: false, facebookToken: null, googleToken: null});
    }
  };

  _getFeedback = (result: Object) => {
    if (result instanceof Error) {
      switch (result.message) {
        case 'error.password':
          return (
            <FormattedMessage
              id="login.error.password"
              defaultMessage={
                'The email/password combination entered is invalid.'
              }
            />
          );
        case 'error.create_user':
          return (
            <FormattedMessage
              id="login.error.create_user"
              defaultMessage="Sorry, the site is currently invite-only."
            />
          );
        default:
          return;
      }
    }
    if (this.state.activeTab === 'sign_in') {
      return;
    }
    return (
      <span className="text-success">
        {this.state.activeTab === 'create_user' ? (
          <FormattedMessage
            id="login.create_user.feedback"
            defaultMessage={`
              Thanks!  Check your email for the link to continue the process.
            `}
          />
        ) : (
          <FormattedMessage
            id="login.forgot_password.feedback"
            defaultMessage={`
              Submitted.  Check your email for the link to reset your password.
            `}
          />
        )}
      </span>
    );
  };

  _onClosed = (response: any) => {
    response &&
      response.type === 'logged-in' &&
      this.props.setUserStatus(response);
    this.props.onClose && this.props.onClose();
  };

  _renderSignInPane() {
    return (
      <TabPane tabId="sign_in">
        <Form onSubmit={event => event.preventDefault()}>
          {this._renderEmail('sign_in', 'username')}
          <PasswordGroup
            current={true}
            value={this.state.password}
            setValue={value => this.setState({password: value})}
          />
          <StayLoggedInCheckbox
            value={this.state.stayLoggedIn}
            setValue={value => this.setState({stayLoggedIn: value})}
          />
          <input
            ref={button => (this._submitButton = button)}
            type="submit"
            className="d-none"
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
          {this._renderEmail('create_user')}
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
          {this._renderEmail('forgot_password')}
        </Form>
      </TabPane>
    );
  }

  _renderEmail(tab: LoginDialogTab, autoComplete: string = 'on') {
    const id = tab + '-email';
    return (
      <FormGroup>
        <Label for={id}>
          <FormattedMessage id="login.email" defaultMessage="Email" />
        </Label>
        <Input
          type="email"
          id={id}
          autoComplete={autoComplete}
          value={this.state.email}
          valid={isEmailValid(this.state.email)}
          maxLength={MAX_EMAIL_LENGTH}
          onInput={event => this.setState({email: event.target.value})}
        />
      </FormGroup>
    );
  }
}

/**
 * A dialog used to perform initial user setup.
 *
 * @param props.setUserStatus the function used to set the user status in the
 * containing context.
 */
export class UserSetupDialog extends React.Component<
  {userStatus: LoggedInResponse, setUserStatus: LoggedInResponse => void},
  {
    displayName: string,
    password: string,
    reenterPassword: string,
    stayLoggedIn: boolean,
    facebookToken: ?string,
    googleToken: ?string,
  },
> {
  state = {
    displayName: '',
    password: '',
    reenterPassword: '',
    stayLoggedIn: false,
    facebookToken: null,
    googleToken: null,
  };

  render() {
    return (
      <RequestDialog
        header={
          <FormattedMessage id="user_setup.title" defaultMessage="Welcome!" />
        }
        makeRequest={this._makeRequest}
        autoRequest={!!(this.state.facebookToken || this.state.googleToken)}
        invalid={
          !(
            isDisplayNameValid(this.state.displayName) &&
            isPasswordValid(this.state.password) &&
            this.state.reenterPassword === this.state.password
          )
        }
        onClosed={this._onClosed}>
        <Form>
          <FormGroup className="text-center">
            <FormattedMessage
              id="user_setup.text"
              defaultMessage={`
                Welcome to Phantasml.  If you wish to log in as {email}, please
                take a moment to configure your display name and password.
              `}
              values={{
                email: (
                  <span className="text-info">
                    {this.props.userStatus.externalId}
                  </span>
                ),
              }}
            />
          </FormGroup>
          <FormGroup>
            <Label for="display-name">
              <FormattedMessage
                id="user.display_name"
                defaultMessage="Display Name"
              />
            </Label>
            <Input
              id="display-name"
              value={this.state.displayName}
              valid={isDisplayNameValid(this.state.displayName)}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              onInput={event =>
                this.setState({displayName: event.target.value})
              }
            />
            <FormText>
              <FormattedMessage
                id="user.display_name.text"
                defaultMessage="This is how you will be identified to other users."
              />
            </FormText>
          </FormGroup>
          <VerifiedPasswordGroups
            password={this.state.password}
            setPassword={password => this.setState({password})}
            reenterPassword={this.state.reenterPassword}
            setReenterPassword={reenterPassword =>
              this.setState({reenterPassword})
            }
          />
          <StayLoggedInCheckbox
            value={this.state.stayLoggedIn}
            setValue={value => this.setState({stayLoggedIn: value})}
          />
        </Form>
        <ExternalButtons
          setGoogleToken={googleToken => this.setState({googleToken})}
          setFacebookToken={facebookToken => this.setState({facebookToken})}
        />
      </RequestDialog>
    );
  }

  _makeRequest = async () => {
    try {
      if (this.state.facebookToken) {
        const request: UserSetupRequest = {
          type: 'facebook',
          accessToken: this.state.facebookToken,
        };
        return await postToApi('/user/setup', request);
      }
      if (this.state.googleToken) {
        const request: UserSetupRequest = {
          type: 'google',
          idToken: this.state.googleToken,
        };
        return await postToApi('/user/setup', request);
      }
      const request: UserSetupRequest = {
        type: 'password',
        displayName: this.state.displayName,
        password: this.state.password,
        stayLoggedIn: this.state.stayLoggedIn,
      };
      return await postToApi('/user/setup', request);
    } finally {
      this.setState({facebookToken: null, googleToken: null});
    }
  };

  _onClosed = (response: any) => {
    response && this.props.setUserStatus(response);
  };
}

/**
 * Renders the Google/Facebook login buttons.
 *
 * @param props.setGoogleToken the setter for the Google id token.
 * @param props.setFacebookToken the setter for the Facebook access token.
 */
class ExternalButtons extends React.Component<
  {setGoogleToken: string => void, setFacebookToken: string => void},
  {},
> {
  render() {
    return (
      <Container>
        <div className="text-center login-or">
          — <FormattedMessage id="login.or" defaultMessage="or" /> —
        </div>
        <Row noGutters className="justify-content-around">
          <Col md="auto">
            <div ref={this._renderGoogleButton} />
          </Col>
          {FB ? (
            <Col md="auto">
              <div
                ref={this._renderFacebookButton}
                className="fb-login-button"
                data-size="large"
                data-button-type="login_with"
              />
            </Col>
          ) : null}
        </Row>
      </Container>
    );
  }

  componentDidMount() {
    FB && FB.Event.subscribe('auth.login', this._setFBAuthResponse);
  }

  componentWillUnmount() {
    FB && FB.Event.unsubscribe('auth.login', this._setFBAuthResponse);
  }

  _setFBAuthResponse = (response: Object) => {
    this.props.setFacebookToken(response.authResponse.accessToken);
  };

  _renderGoogleButton = (element: ?HTMLDivElement) => {
    element &&
      gapi.signin2.render(element, {
        longtitle: true,
        theme: 'dark',
        height: 40,
        onsuccess: user => {
          this.props.setGoogleToken(user.getAuthResponse(true).id_token);
        },
      });
  };

  _renderFacebookButton(element: ?HTMLDivElement) {
    element && FB.XFBML.parse(element.parentElement);
  }
}

/**
 * A dialog used to reset the user's password from an email.
 *
 * @param props.setUserStatus the function used to set the user status in the
 * containing context.
 */
export class PasswordResetDialog extends React.Component<
  {setUserStatus: LoggedInResponse => void},
  {password: string, reenterPassword: string, stayLoggedIn: boolean},
> {
  state = {password: '', reenterPassword: '', stayLoggedIn: false};

  render() {
    return (
      <RequestDialog
        header={
          <FormattedMessage
            id="password_reset.title"
            defaultMessage="Reset Password"
          />
        }
        makeRequest={this._makeRequest}
        invalid={
          !(
            isPasswordValid(this.state.password) &&
            this.state.reenterPassword === this.state.password
          )
        }
        onClosed={this._onClosed}>
        <Form>
          <FormGroup className="text-center">
            <FormattedMessage
              id="password_reset.text"
              defaultMessage={`
                Please enter and verify the password you
                would like to use to log in.
              `}
            />
          </FormGroup>
          <VerifiedPasswordGroups
            password={this.state.password}
            setPassword={password => this.setState({password})}
            reenterPassword={this.state.reenterPassword}
            setReenterPassword={reenterPassword =>
              this.setState({reenterPassword})
            }
          />
          <StayLoggedInCheckbox
            value={this.state.stayLoggedIn}
            setValue={value => this.setState({stayLoggedIn: value})}
          />
        </Form>
      </RequestDialog>
    );
  }

  _makeRequest = async () => {
    const request: UserPasswordRequest = {
      password: this.state.password,
      stayLoggedIn: this.state.stayLoggedIn,
    };
    return await postToApi('/user/password', request);
  };

  _onClosed = (response: any) => {
    response && this.props.setUserStatus(response);
  };
}

/**
 * Form groups for entering a password and reentering it for verification.
 *
 * @param props.password the value of the password field.
 * @param props.setPassword the function to set the password field.
 * @param props.reenterPassword the value of the reentered field.
 * @param props.setReenterPassword the function to set the reentered field.
 */
function VerifiedPasswordGroups(props: {
  password: string,
  setPassword: string => void,
  reenterPassword: string,
  setReenterPassword: string => void,
}) {
  return [
    <PasswordGroup value={props.password} setValue={props.setPassword} />,
    <FormGroup>
      <Label for="reenter-password">
        <FormattedMessage
          id="user.reenter_password"
          defaultMessage="Reenter Password"
        />
      </Label>
      <Input
        type="password"
        id="reenter-password"
        autoComplete="new-password"
        value={props.reenterPassword}
        valid={
          isPasswordValid(props.password) &&
          props.reenterPassword === props.password
        }
        maxLength={MAX_PASSWORD_LENGTH}
        onInput={event => props.setReenterPassword(event.target.value)}
      />
    </FormGroup>,
  ];
}

/**
 * A form group for entering a password.
 *
 * @param props.current whether or not this is the current password, as opposed
 * to a new one (for autocomplete).
 * @param props.value the value of the field.
 * @param props.setValue the function to set the value.
 */
function PasswordGroup(props: {
  current?: boolean,
  value: string,
  setValue: string => void,
}) {
  return (
    <FormGroup>
      <Label for="password">
        <FormattedMessage id="user.password" defaultMessage="Password" />
      </Label>
      <Input
        type="password"
        id="password"
        autoComplete={props.current ? 'current-password' : 'new-password'}
        value={props.value}
        valid={isPasswordValid(props.value)}
        maxLength={MAX_PASSWORD_LENGTH}
        onInput={event => props.setValue(event.target.value)}
      />
    </FormGroup>
  );
}

/**
 * A labeled checkbox providing the option to stay logged in (that is, to
 * create a persistent session).
 *
 * @param props.value the value of the checkbox.
 * @param props.setValue the function to set the value.
 */
function StayLoggedInCheckbox(props: {
  value: boolean,
  setValue: boolean => void,
}) {
  return (
    <LabeledCheckbox
      className="text-center"
      id="stayLoggedIn"
      checked={props.value}
      onChange={event => props.setValue(event.target.checked)}
      label={
        <FormattedMessage
          id="user.stay_logged_in"
          defaultMessage="Stay logged in"
        />
      }
    />
  );
}

/**
 * Dropdown for the nav bar that shows the user's picture and name if logged
 * in, providing access to user-related controls like "log out."  If not logged
 * in, shows the login button.
 *
 * @param props.userStatus the current user status.
 * @param props.setUserStatus the function to set the user status.
 * @param props.locale the configured locale.
 */
export class UserDropdown extends React.Component<
  {
    userStatus: UserStatusResponse,
    setUserStatus: UserStatusResponse => void,
    locale: string,
  },
  {loading: boolean, dialog: ?React.Element<any>},
> {
  state = {loading: false, dialog: null};

  render() {
    const userStatus = this.props.userStatus;
    return [
      this.state.loading ? <LoadingSpinner key="spinner" /> : null,
      userStatus.type === 'anonymous' ? (
        <Button
          key="control"
          disabled={this.state.loading}
          color="info"
          onClick={() =>
            this.setState({
              dialog: (
                <LoginDialog
                  canCreateUser={userStatus.canCreateUser}
                  setUserStatus={this.props.setUserStatus}
                  locale={this.props.locale}
                  onClose={this._clearDialog}
                  cancelable
                />
              ),
            })
          }>
          <FormattedMessage id="user.login" defaultMessage="Log In" />
        </Button>
      ) : (
        <UncontrolledDropdown key="control" nav>
          <DropdownToggle disabled={this.state.loading} nav caret>
            <img
              className="user-icon"
              src={userStatus.imageUrl}
              width={24}
              height={24}
            />
            {userStatus.displayName}
          </DropdownToggle>
          <DropdownMenu>
            <DropdownItem onClick={this._logout}>
              <FormattedMessage id="user.logout" defaultMessage="Log Out" />
            </DropdownItem>
          </DropdownMenu>
        </UncontrolledDropdown>
      ),
      this.state.dialog,
    ];
  }

  _logout = async () => {
    this.setState({loading: true});
    try {
      const userStatus = await postToApi('/user/logout');
      if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
        await gapi.auth2.getAuthInstance().signOut();
      }
      if (FB && FB.getAuthResponse()) {
        await new Promise(resolve => FB.logout(resolve));
      }
      this.setState({loading: false});
      this.props.setUserStatus(userStatus);
    } catch (error) {
      this.setState({
        loading: false,
        dialog: (
          <ErrorDialog
            key="dialog"
            error={error}
            onClosed={this._clearDialog}
          />
        ),
      });
    }
  };

  _clearDialog = () => this.setState({dialog: null});
}
