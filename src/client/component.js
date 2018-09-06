/**
 * UI components related to entity components.
 *
 * @module client/component
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Menu} from './util/ui';

/**
 * The component menu dropdown.
 */
export class ComponentDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="component.title" defaultMessage="Component" />
        }>
        {this.state.dialog}
      </Menu>
    );
  }
}

/**
 * The component editor view.
 */
export class ComponentEditor extends React.Component<{}, {}> {
  render() {
    return <div />;
  }
}
