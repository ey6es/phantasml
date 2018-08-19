/**
 * Principal interface components.
 *
 * @module client/interface
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {NavbarBrand, Nav} from 'reactstrap';
import {UserDropdown} from './user';
import {
  RESOURCE_PARAM,
  ResourceDropdown,
  ResourceBrowser,
  ResourceContent,
} from './resource';
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
  {loading: boolean, search: string},
> {
  state = {loading: false, search: location.search};

  render() {
    return (
      <div className="interface">
        {this._createContent()}
        {this.state.loading ? (
          <div className="full-interface">
            <div className="loading" />
          </div>
        ) : null}
        <MenuBar
          brand={
            <NavbarBrand onClick={() => this._pushSearch('')}>
              <FormattedMessage id="app.title" defaultMessage="Phantasml" />
            </NavbarBrand>
          }
          disabled={this.state.loading}>
          <Nav navbar>
            <ResourceDropdown
              userStatus={this.props.userStatus}
              setLoading={this._setLoading}
              pushSearch={this._pushSearch}
            />
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

  componentDidMount() {
    window.addEventListener('popstate', this._updateSearch);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this._updateSearch);
  }

  _setLoading = (loading: boolean) => this.setState({loading});

  _pushSearch = (search: string) => {
    if (location.search === search) {
      return;
    }
    history.pushState({}, '', search || location.pathname);
    this._updateSearch();
  };

  _updateSearch = () => {
    this.setState({search: location.search});
  };

  _createContent() {
    if (this.state.search.startsWith('?')) {
      for (const param of this.state.search.substring(1).split('&')) {
        if (param.startsWith(RESOURCE_PARAM)) {
          const id = param.substring(RESOURCE_PARAM.length);
          return (
            <ResourceContent key={id} id={id} setLoading={this._setLoading} />
          );
        }
      }
    }
    return (
      <ResourceBrowser
        key={this.props.userStatus.type}
        userStatus={this.props.userStatus}
        setLoading={this._setLoading}
        pushSearch={this._pushSearch}
      />
    );
  }
}
