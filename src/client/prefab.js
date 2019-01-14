/**
 * Components related to prefabs.
 *
 * @module client/prefab
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Menu, MenuItem} from './util/ui';

/**
 * The dropdown menu for prefabs.
 *
 * @param props the element properties.
 */
export class PrefabDropdown extends React.Component<{}, {}> {
  render() {
    return (
      <Menu
        label={<FormattedMessage id="prefab.title" defaultMessage="Prefab" />}>
        <CreatePrefabItem />
        <SavePrefabItem />
        <RefreshPrefabItem />
        <UnlinkPrefabItem />
      </Menu>
    );
  }
}

const CreatePrefabItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="prefab.create" defaultMessage="Create" />
  </MenuItem>
));

const SavePrefabItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="prefab.save" defaultMessage="Save" />
  </MenuItem>
));

const RefreshPrefabItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="prefab.refresh" defaultMessage="Refresh" />
  </MenuItem>
));

const UnlinkPrefabItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="prefab.unlink" defaultMessage="Unlink" />
  </MenuItem>
));
