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
  {},
> {
  render() {
    return (
      <div className="interface">
        <MenuBar
          brand={
            <FormattedMessage id="app.title" defaultMessage="Phantasml" />
          }>
          <Nav navbar>
            <ResourceDropdown />
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
      </div>
    );
  }
}
