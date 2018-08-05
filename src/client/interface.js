/**
 * Principal interface components.
 *
 * @module client/interface
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Collapse, Nav, Navbar, NavbarBrand, NavbarToggler} from 'reactstrap';
import {UserDropdown} from './user';
import {AdminDropdown} from './admin';
import type {UserStatusResponse} from '../server/api';

/**
 * The main app interface.
 */
export class Interface extends React.Component<
  {userStatus: UserStatusResponse, setUserStatus: UserStatusResponse => void},
  {},
> {
  render() {
    return (
      <div className="interface">
        <TopBar
          userStatus={this.props.userStatus}
          setUserStatus={this.props.setUserStatus}
        />
      </div>
    );
  }
}

class TopBar extends React.Component<
  {userStatus: UserStatusResponse, setUserStatus: UserStatusResponse => void},
  {open: boolean},
> {
  state = {open: false};

  render() {
    return (
      <Navbar color="primary" dark expand="md">
        <NavbarBrand>
          <FormattedMessage id="app.title" defaultMessage="Phantasml" />
        </NavbarBrand>
        <NavbarToggler onClick={this._toggle} />
        <Collapse isOpen={this.state.open} navbar>
          <Nav navbar>
            {this.props.userStatus.admin ? <AdminDropdown /> : null}
          </Nav>
          <Nav className="ml-auto" navbar>
            <UserDropdown
              userStatus={this.props.userStatus}
              setUserStatus={this.props.setUserStatus}
            />
          </Nav>
        </Collapse>
      </Navbar>
    );
  }

  _toggle = () => this.setState({open: !this.state.open});
}
