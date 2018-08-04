/**
 * Client entry point.
 *
 * @module client/app
 * @flow
 */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {IntlProvider, FormattedMessage} from 'react-intl';
import {Modal, ModalHeader, ModalBody, ModalFooter, Button} from 'reactstrap';
import {Interface} from './interface';
import {LoginDialog, UserSetupDialog, PasswordResetDialog} from './user';
import {
  metatags,
  setAuthToken,
  clearAuthToken,
  getFromApi,
  postToApi,
} from './util/api';
import {ErrorDialog} from './util/ui';
import type {UserStatusResponse} from '../server/api';

type UserStatus = UserStatusResponse | Error;

declare var gapi: any;
declare var FB: any;

const googleAuthPromise = new Promise((resolve, reject) => {
  gapi.load('auth2', () => {
    gapi.auth2
      .init({
        client_id: metatags.get('google-signin-client_id'),
      })
      .then(resolve, reject);
  });
});

FB.init({
  appId: metatags.get('facebook-app-id'),
  version: 'v3.1',
  xfbml: true,
});

/**
 * Application root component.
 */
class App extends React.Component<
  {initialUserStatus: UserStatus},
  {loading: boolean, locale: string, userStatus: UserStatus},
> {
  state = {
    loading: false,
    locale: 'en-US',
    userStatus: this.props.initialUserStatus,
  };

  _fetchUserStatus = async () => {
    this.setState({loading: true});
    this.setState({
      loading: false,
      userStatus: await getUserStatus(),
    });
  };

  _setUserStatus = (status: UserStatus) => {
    // store or clear the auth token if appropriate
    if (!(status instanceof Error)) {
      if (status.type === 'anonymous') {
        clearAuthToken();
      } else if (status.authToken) {
        setAuthToken(status.authToken, status.persistAuthToken);
      }
    }
    this.setState({userStatus: status});
  };

  render() {
    if (this.state.loading) {
      return <div className="loading" />;
    }
    let dialog: ?React.Element<any>;
    let ui: ?React.Element<any>;
    const userStatus = this.state.userStatus;
    if (userStatus instanceof Error) {
      dialog = (
        <ErrorDialog
          error={userStatus}
          closeMessage={
            <FormattedMessage id="error.retry" defaultMessage="Retry" />
          }
          onClosed={this._fetchUserStatus}
        />
      );
    } else if (userStatus.type === 'anonymous') {
      if (userStatus.allowAnonymous) {
        ui = (
          <Interface
            userStatus={userStatus}
            setUserStatus={this._setUserStatus}
          />
        );
      } else {
        dialog = (
          <LoginDialog
            canCreateUser={userStatus.canCreateUser}
            setUserStatus={this._setUserStatus}
            locale={this.state.locale}
          />
        );
      }
    } else {
      // userStatus.type === 'logged-in'
      if (!userStatus.displayName) {
        dialog = (
          <UserSetupDialog
            userStatus={userStatus}
            setUserStatus={this._setUserStatus}
          />
        );
      } else if (userStatus.passwordReset) {
        dialog = <PasswordResetDialog setUserStatus={this._setUserStatus} />;
      }
      ui = (
        <Interface
          userStatus={userStatus}
          setUserStatus={this._setUserStatus}
        />
      );
    }
    return (
      <IntlProvider locale={this.state.locale} defaultLocale="en-US">
        <div>
          {dialog}
          {ui}
        </div>
      </IntlProvider>
    );
  }
}

async function getUserStatus(): Promise<UserStatus> {
  try {
    let [status, googleAuth, facebookStatus] = await Promise.all([
      getFromApi('/user/status'),
      googleAuthPromise,
      new Promise(resolve => FB.getLoginStatus(resolve)),
    ]);
    if (status.type === 'anonymous') {
      // if we're not logged in to Phantasml but *are* logged in to Google/FB,
      // request login automatically.  if it fails, log out of Google/FB
      const googleUser = googleAuth.currentUser.get();
      if (googleUser) {
        try {
          status = await postToApi('/user/login', {
            type: 'google',
            idToken: googleUser.getAuthResponse(true).id_token,
          });
        } catch (error) {
          await googleAuth.signOut();
        }
      } else if (facebookStatus.authResponse) {
        try {
          status = await postToApi('/user/login', {
            type: 'facebook',
            accessToken: facebookStatus.authResponse.accessToken,
          });
        } catch (error) {
          await new Promise(resolve => FB.logout(resolve));
        }
      }
    }
    return status;
  } catch (error) {
    return error;
  }
}

// contact api to determine session information
(async function() {
  ReactDOM.render(
    <App initialUserStatus={await getUserStatus()} />,
    (document.getElementById('app'): any),
  );
})();
