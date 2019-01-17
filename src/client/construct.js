/**
 * Components related to constructs.
 *
 * @module client/construct
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Menu, MenuItem} from './util/ui';

/**
 * The dropdown menu for constructs.
 *
 * @param props the element properties.
 */
export class ConstructDropdown extends React.Component<{}, {}> {
  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="construct.title" defaultMessage="Construct" />
        }>
        <CreateConstructItem />
        <SaveConstructItem />
        <RefreshConstructItem />
        <UnlinkConstructItem />
      </Menu>
    );
  }
}

const CreateConstructItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="construct.create" defaultMessage="Create" />
  </MenuItem>
));

const SaveConstructItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="construct.save" defaultMessage="Save" />
  </MenuItem>
));

const RefreshConstructItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="construct.refresh" defaultMessage="Refresh" />
  </MenuItem>
));

const UnlinkConstructItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="construct.unlink" defaultMessage="Unlink" />
  </MenuItem>
));
