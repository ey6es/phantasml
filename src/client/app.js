/**
 * Client entry point.
 *
 * @module client/app
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import * as ReactDOM from 'react-dom';
import {IntlProvider, FormattedMessage} from 'react-intl';
import {Modal, ModalHeader, ModalBody, ModalFooter, Button} from 'reactstrap';
import {Interface} from './interface';
import {
  LoginDialog,
  UserSetupDialog,
  PasswordResetDialog,
  CompleteTransferDialog,
} from './user';
import store from './store';
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

// hackery to avoid doing Facebook anything on http
if (location.protocol === 'https:') {
  FB.init({
    appId: metatags.get('facebook-app-id'),
    version: 'v3.1',
  });
} else {
  window.FB = null;
}

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

  render() {
    if (this.state.loading) {
      return (
        <div class="full-screen">
          <div class="loading" />
        </div>
      );
    }
    let dialog: ?React.Element<any>;
    let interfaceUserStatus: ?UserStatusResponse;
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
        interfaceUserStatus = userStatus;
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
      if (userStatus.transfer) {
        dialog = (
          <CompleteTransferDialog
            userStatus={userStatus}
            setUserStatus={this._setUserStatus}
          />
        );
      } else if (!userStatus.displayName) {
        dialog = (
          <UserSetupDialog
            userStatus={userStatus}
            setUserStatus={this._setUserStatus}
          />
        );
      } else if (userStatus.passwordReset) {
        dialog = (
          <PasswordResetDialog
            userStatus={userStatus}
            setUserStatus={this._setUserStatus}
          />
        );
      }
      interfaceUserStatus = userStatus;
    }
    return (
      <IntlProvider locale={this.state.locale} defaultLocale="en-US">
        <div>
          {dialog}
          {interfaceUserStatus ? (
            <Interface
              userStatus={interfaceUserStatus}
              setUserStatus={this._setUserStatus}
              locale={this.state.locale}
            />
          ) : null}
        </div>
      </IntlProvider>
    );
  }

  _fetchUserStatus = async () => {
    this.setState({loading: true});
    this.setState({
      loading: false,
      userStatus: await getUserStatus(),
    });
  };

  _setUserStatus = (status: UserStatus) => {
    updateAuthToken(status);
    this.setState({userStatus: status});
  };
}

async function getUserStatus(): Promise<UserStatus> {
  try {
    let [status, googleAuth, facebookStatus] = await Promise.all([
      getFromApi('/user/status'),
      googleAuthPromise,
      FB && new Promise(resolve => FB.getLoginStatus(resolve)),
    ]);
    if (status.type === 'anonymous') {
      // if we're not logged in to Phantasml but *are* logged in to Google/FB,
      // request login automatically.  if it fails, log out of Google/FB
      if (googleAuth.isSignedIn.get()) {
        const googleUser = googleAuth.currentUser.get();
        try {
          status = await postToApi('/user/login', {
            type: 'google',
            idToken: googleUser.getAuthResponse(true).id_token,
          });
        } catch (error) {
          await googleAuth.signOut();
        }
      } else if (facebookStatus && facebookStatus.authResponse) {
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
    updateAuthToken(status);
    return status;
  } catch (error) {
    return error;
  }
}

function updateAuthToken(status: UserStatus) {
  if (!(status instanceof Error)) {
    if (status.type === 'anonymous') {
      clearAuthToken();
    } else if (status.authToken) {
      setAuthToken(status.authToken, status.persistAuthToken);
    }
  }
}

// contact api to determine session information
(async function() {
  ReactDOM.render(
    <ReactRedux.Provider store={store}>
      <App initialUserStatus={await getUserStatus()} />
    </ReactRedux.Provider>,
    (document.getElementById('app'): any),
  );
})();
