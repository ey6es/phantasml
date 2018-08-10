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
import {Menu, MenuItem, Submenu} from './util/ui';

/**
 * The dropdown menu for resources.
 */
export class ResourceDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="resource.title" defaultMessage="Resource" />
        }>
        <MenuItem>
          <FormattedMessage id="resource.test" defaultMessage="Test" />
        </MenuItem>
        <Submenu
          label={<FormattedMessage id="resource.new" defaultMessage="New" />}>
          <MenuItem>
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

  _clearDialog = () => this.setState({dialog: null});
}
