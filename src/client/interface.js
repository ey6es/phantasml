/**
 * Principal interface components.
 *
 * @module client/interface
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Nav} from 'reactstrap';
import {UserDropdown} from './user';
import {ResourceDropdown} from './resource';
import {AdminDropdown} from './admin';
import {MenuBar} from './util/ui';
import type {UserStatusResponse} from '../server/api';

/**
 * The main app interface.
 */
export class Interface extends React.Component<
  {
    userStatus: UserStatusResponse,
    setUserStatus: UserStatusResponse => void,
    locale: string,
  },
  {loading: boolean},
> {
  state = {loading: false};

  render() {
    return (
      <div className="interface">
        <MenuBar
          brand={<FormattedMessage id="app.title" defaultMessage="Phantasml" />}
          disabled={this.state.loading}>
          <Nav navbar>
            <ResourceDropdown setLoading={this._setLoading} />
            {this.props.userStatus.admin ? (
              <AdminDropdown locale={this.props.locale} />
            ) : null}
          </Nav>
          <Nav className="ml-auto" navbar>
            <UserDropdown
              userStatus={this.props.userStatus}
              setUserStatus={this.props.setUserStatus}
              locale={this.props.locale}
            />
          </Nav>
        </MenuBar>
        {this.state.loading ? (
          <div className="position-relative flex-grow-1">
            <div className="loading" />
          </div>
        ) : null}
      </div>
    );
  }

  _setLoading = (loading: boolean) => this.setState({loading});
}
