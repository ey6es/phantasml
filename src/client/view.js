/**
 * Components related to viewing.
 *
 * @module client/view
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Menu} from './util/ui';

/**
 * The view menu dropdown.
 */
export class ViewDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu label={<FormattedMessage id="view.title" defaultMessage="View" />}>
        {this.state.dialog}
      </Menu>
    );
  }
}

/**
 * The 2D scene view.
 */
export class SceneView extends React.Component<{}, {}> {
  render() {
    return <div className="flex-grow-1" />;
  }
}
