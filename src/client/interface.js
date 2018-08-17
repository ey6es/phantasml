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
  {loading: boolean, content: ?React.Element<any>},
> {
  // define this early becaue createContent needs it
  _setLoading = (loading: boolean, updateContent: ?boolean) => {
    if (updateContent) {
      this.setState({
        loading,
        content: loading ? null : this._createContent(),
      });
    } else {
      this.setState({loading});
    }
  };

  state = {loading: false, content: this._createContent()};

  render() {
    return (
      <div className="interface">
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
        {this.state.content}
        {this.state.loading ? (
          <div className="position-relative flex-grow-1">
            <div className="loading" />
          </div>
        ) : null}
      </div>
    );
  }

  componentDidMount() {
    window.addEventListener('popstate', this._handlePopState);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this._handlePopState);
  }

  _pushSearch = (search: string) => {
    if (location.search === search) {
      return;
    }
    history.pushState({}, '', search || location.pathname);
    this.setState({content: this._createContent()});
  };

  _handlePopState = () => {
    this.setState({content: this._createContent()});
  };

  _createContent() {
    if (location.search.startsWith('?')) {
      for (const param of location.search.substring(1).split('&')) {
        if (param.startsWith(RESOURCE_PARAM)) {
          const id = param.substring(RESOURCE_PARAM.length);
          return (
            <ResourceContent key={id} id={id} setLoading={this._setLoading} />
          );
        }
      }
    }
    return <ResourceBrowser setLoading={this._setLoading} />;
  }
}
