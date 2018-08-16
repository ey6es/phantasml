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
import {getFromApi, postToApi} from './util/api';
import {Menu, MenuItem, Submenu, ErrorDialog} from './util/ui';
import type {ResourceType, ResourceCreateRequest} from '../server/api';

/** The parameter prefix used for resources. */
export const RESOURCE_PARAM = 'r=';

/**
 * The dropdown menu for resources.
 *
 * @param props.setLoading the function to set the loading state.
 */
export class ResourceDropdown extends React.Component<
  {setLoading: (boolean, ?boolean) => void, pushSearch: string => void},
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
    this.props.setLoading(true, true);
    try {
      const request: ResourceCreateRequest = {type};
      const response = await postToApi('/resource', request);
      this.props.pushSearch('?' + RESOURCE_PARAM + response.id);
    } catch (error) {
      this.props.setLoading(false, true);
      this.setState({
        dialog: <ErrorDialog error={error} onClosed={this._clearDialog} />,
      });
    }
  }

  _clearDialog = () => this.setState({dialog: null});
}

/**
 * Content for viewing/editing resources.
 *
 * @param props.id the id of the resource to load.
 * @param props.setLoading the function to set the loading state.
 */
export class ResourceContent extends React.Component<
  {id: string, setLoading: (boolean, ?boolean) => void},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return <div>{this.state.dialog}</div>;
  }

  async componentDidMount() {
    this.props.setLoading(true);
    try {
      const response = await getFromApi('/resource/' + this.props.id);
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
