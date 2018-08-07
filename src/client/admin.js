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
  FormGroup,
  Label,
  Input,
} from 'reactstrap';
import {getFromApi, putToApi, postToApi} from './util/api';
import {RequestDialog, LabeledCheckbox} from './util/ui';
import type {PutAdminSettingsRequest, AdminInviteRequest} from '../server/api';
import {isEmailValid} from '../server/constants';

/**
 * The dropdown menu for admins.
 *
 * @param props.locale the currently configured locale.
 */
export class AdminDropdown extends React.Component<
  {locale: string},
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
          <DropdownItem
            onClick={() =>
              this.setState({
                dialog: (
                  <SendInvitesDialog
                    locale={this.props.locale}
                    onClosed={this._clearDialog}
                  />
                ),
              })
            }>
            <FormattedMessage
              id="admin.send_invites"
              defaultMessage="Send Invites..."
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

class SendInvitesDialog extends React.Component<
  {locale: string, onClosed: () => void},
  {addresses: string},
> {
  state = {addresses: ''};

  render() {
    const firstAddress = this._getAddressArray()[0];
    return (
      <RequestDialog
        header={
          <FormattedMessage
            id="send_invites.title"
            defaultMessage="Send Invites"
          />
        }
        invalid={!(firstAddress && isEmailValid(firstAddress))}
        makeRequest={this._makeRequest}
        getFeedback={this._getFeedback}
        onClosed={this.props.onClosed}
        applicable
        cancelable>
        <Form>
          <FormGroup className="text-center">
            <FormattedMessage
              id="send_invites.text"
              defaultMessage={
                'Enter the email addresses to invite below (one per line).'
              }
            />
          </FormGroup>
          <FormGroup>
            <Label for="emailAddresses">
              <FormattedMessage
                id="send_invites.email_addresses"
                defaultMessage="Email Addresses"
              />
            </Label>
            <Input
              type="textarea"
              id="emailAddresses"
              value={this.state.addresses}
              onInput={event => this.setState({addresses: event.target.value})}
            />
          </FormGroup>
        </Form>
      </RequestDialog>
    );
  }

  _makeRequest = async () => {
    const request: AdminInviteRequest = {
      addresses: this._getAddressArray(),
      locale: this.props.locale,
    };
    const response = await postToApi('/admin/invite', request);
    this.setState({addresses: ''});
    return response;
  };

  _getAddressArray(): string[] {
    return this.state.addresses
      .split('\n')
      .map(address => address.trim())
      .filter(address => address);
  }

  _getFeedback = (result: Object) => {
    if (!(result instanceof Error)) {
      return (
        <span className="text-success">
          <FormattedMessage
            id="send_invites.feedback"
            defaultMessage="Invites sent!"
          />
        </span>
      );
    }
  };
}
