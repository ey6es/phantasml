/**
 * Components related to selection operations.
 *
 * @module client/selection
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Menu} from './util/ui';

/**
 * The selection menu dropdown.
 */
export class SelectionDropdown extends React.Component<{}, {}> {
  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="selection.title" defaultMessage="Selection" />
        }
      />
    );
  }
}
