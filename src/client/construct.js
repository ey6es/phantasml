/**
 * Components related to constructs.
 *
 * @module client/construct
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {ResourceMetadataDialog} from './resource';
import {Menu, MenuItem} from './util/ui';
import {Scene} from '../server/store/scene';

/**
 * The dropdown menu for constructs.
 *
 * @param props the element properties.
 */
export class ConstructDropdown extends React.Component<
  {locale: string, setDialog: (?React.Element<any>) => void},
  {},
> {
  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="construct.title" defaultMessage="Construct" />
        }>
        <CreateConstructItem
          locale={this.props.locale}
          setDialog={this.props.setDialog}
        />
        <SaveConstructItem />
        <RefreshConstructItem />
        <UnlinkConstructItem />
        <OpenConstructItem />
      </Menu>
    );
  }
}

const CreateConstructItem = ReactRedux.connect(state => {
  let disabled = true;
  const resource = state.resource;
  if (resource instanceof Scene && state.selection.size === 1) {
    const id = state.selection.values().next().value;
    if (!resource.isInitialEntity(id)) {
      const entity = resource.getEntity(id);
      if (entity) {
        disabled = !!entity.getConstruct();
      }
    }
  }
  return {disabled};
})(
  (props: {
    disabled: boolean,
    locale: string,
    setDialog: (?React.Element<any>) => void,
  }) => (
    <MenuItem
      disabled={props.disabled}
      onClick={() =>
        props.setDialog(
          <CreateConstructDialog
            locale={props.locale}
            resource={{
              name: '',
              description: '',
              id: '',
              ownerId: '',
              type: 'construct',
              lastOwnerAccessTime: '',
            }}
            setResource={resource => {}}
            onClosed={() => props.setDialog(null)}
          />,
        )
      }>
      <FormattedMessage id="construct.create" defaultMessage="Create" />
    </MenuItem>
  ),
);

class CreateConstructDialog extends ResourceMetadataDialog {
  get _header() {
    return (
      <FormattedMessage
        id="construct.create.title"
        defaultMessage="Create Construct"
      />
    );
  }

  get _applicable(): boolean {
    return false;
  }

  async _submitRequest() {}
}

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

const OpenConstructItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="construct.open" defaultMessage="Open" />
  </MenuItem>
));
