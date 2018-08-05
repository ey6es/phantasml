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
} from 'reactstrap';

/**
 * The dropdown menu for admins.
 */
export function AdminDropdown() {
  return (
    <UncontrolledDropdown nav>
      <DropdownToggle nav caret>
        <FormattedMessage id="admin.title" defaultMessage="Admin" />
      </DropdownToggle>
      <DropdownMenu>
        <DropdownItem onClick={() => {}}>
          <FormattedMessage
            id="admin.site_settings"
            defaultMessage="Site Settings..."
          />
        </DropdownItem>
      </DropdownMenu>
    </UncontrolledDropdown>
  );
}
