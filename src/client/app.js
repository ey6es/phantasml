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
import {LoginDialog, AcceptInviteDialog, PasswordResetDialog} from './user';
import {getFromApi} from './util/api';
import {ServerErrorMessage} from './util/ui';
import type {UserStatusResponse} from '../server/api';

type UserStatus = UserStatusResponse | Error;

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
      dialog = <ErrorDialog error={userStatus} retry={this._fetchUserStatus} />;
    } else if (userStatus.type === 'anonymous') {
      if (userStatus.allowAnonymous) {
        ui = <Interface userStatus={userStatus} />;
      } else {
        dialog = (
          <LoginDialog
            canCreateUser={userStatus.canCreateUser}
            setUserStatus={this._setUserStatus}
          />
        );
      }
    } else {
      // userStatus.type === 'logged-in'
      if (userStatus.invite) {
        dialog = <AcceptInviteDialog />;
      } else if (userStatus.passwordReset) {
        dialog = <PasswordResetDialog />;
      }
      ui = <Interface userStatus={userStatus} />;
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

/**
 * Error dialog for initial connection.
 */
class ErrorDialog extends React.Component<
  {error: Error, retry: () => mixed},
  {open: boolean},
> {
  state = {open: true};

  _close = () => this.setState({open: false});

  render() {
    return (
      <Modal
        isOpen={this.state.open}
        centered={true}
        onClosed={this.props.retry}>
        <ModalHeader>
          <FormattedMessage id="error.title" defaultMessage="Error" />
        </ModalHeader>
        <ModalBody>
          <ServerErrorMessage />
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={this._close}>
            <FormattedMessage id="error.retry" defaultMessage="Retry" />
          </Button>
        </ModalFooter>
      </Modal>
    );
  }
}

async function getUserStatus(): Promise<UserStatus> {
  try {
    return await getFromApi('/user/status');
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
