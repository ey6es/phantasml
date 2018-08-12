/**
 * Components related to resources.
 *
 * @module client/resource
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
} from 'reactstrap';
import {postToApi} from './util/api';
import {Menu, MenuItem, Submenu, ErrorDialog} from './util/ui';
import type {ResourceType, ResourceCreateRequest} from '../server/api';

/**
 * The dropdown menu for resources.
 *
 * @param props.setLoading the function to set the loading state.
 */
export class ResourceDropdown extends React.Component<
  {setLoading: boolean => void},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="resource.title" defaultMessage="Resource" />
        }>
        <Submenu
          label={<FormattedMessage id="resource.new" defaultMessage="New" />}>
          <MenuItem onClick={() => this._createResource('environment')}>
            <FormattedMessage
              id="resource.environment"
              defaultMessage="Environment"
            />
          </MenuItem>
        </Submenu>
        {this.state.dialog}
      </Menu>
    );
  }

  async _createResource(type: ResourceType) {
    this.props.setLoading(true);
    try {
      const request: ResourceCreateRequest = {type};
      const response = await postToApi('/resource/create', request);
      history.pushState({}, '', '?r=' + response.id);
    } catch (error) {
      this.setState({
        dialog: <ErrorDialog error={error} onClosed={this._clearDialog} />,
      });
    } finally {
      this.props.setLoading(false);
    }
  }

  _clearDialog = () => this.setState({dialog: null});
}
