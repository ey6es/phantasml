/**
 * Administrative components.
 *
 * @module client/interface
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Form,
} from 'reactstrap';
import {getFromApi, putToApi} from './util/api';
import {RequestDialog, LabeledCheckbox} from './util/ui';
import type {PutAdminSettingsRequest} from '../server/api';

/**
 * The dropdown menu for admins.
 */
export class AdminDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <UncontrolledDropdown nav>
        <DropdownToggle nav caret>
          <FormattedMessage id="admin.title" defaultMessage="Admin" />
        </DropdownToggle>
        <DropdownMenu>
          <DropdownItem
            onClick={() =>
              this.setState({
                dialog: <SiteSettingsDialog onClosed={this._clearDialog} />,
              })
            }>
            <FormattedMessage
              id="admin.site_settings"
              defaultMessage="Site Settings..."
            />
          </DropdownItem>
        </DropdownMenu>
        {this.state.dialog}
      </UncontrolledDropdown>
    );
  }

  _clearDialog = () => this.setState({dialog: null});
}

class SiteSettingsDialog extends React.Component<
  {onClosed: () => void},
  {loaded: boolean, allowAnonymous: boolean, canCreateUser: boolean},
> {
  state = {loaded: false, allowAnonymous: false, canCreateUser: false};

  render() {
    return (
      <RequestDialog
        header={
          <FormattedMessage
            id="site_settings.title"
            defaultMessage="Site Settings"
          />
        }
        loadState={this._loadState}
        makeRequest={this._makeRequest}
        onClosed={this.props.onClosed}
        applicable
        cancelable>
        {this.state.loaded ? (
          <Form>
            <LabeledCheckbox
              id="allowAnonymous"
              checked={this.state.allowAnonymous}
              onChange={event =>
                this.setState({allowAnonymous: event.target.checked})
              }
              label={
                <FormattedMessage
                  id="site_settings.allow_anonymous"
                  defaultMessage="Allow anonymous access"
                />
              }
            />
            <LabeledCheckbox
              id="canCreateUser"
              checked={this.state.canCreateUser}
              onChange={event =>
                this.setState({canCreateUser: event.target.checked})
              }
              label={
                <FormattedMessage
                  id="site_settings.can_create_user"
                  defaultMessage="Allow new users"
                />
              }
            />
          </Form>
        ) : null}
      </RequestDialog>
    );
  }

  _loadState = async () => {
    const settings = await getFromApi('/admin/settings');
    this.setState({
      loaded: true,
      allowAnonymous: !!settings.allowAnonymous,
      canCreateUser: !!settings.canCreateUser,
    });
  };

  _makeRequest = async () => {
    const request: PutAdminSettingsRequest = {
      allowAnonymous: this.state.allowAnonymous,
      canCreateUser: this.state.canCreateUser,
    };
    return await putToApi('/admin/settings', request);
  };
}
