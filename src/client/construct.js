/**
 * Components related to constructs.
 *
 * @module client/construct
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {
  ResourceMetadataDialog,
  getResourceMetadataPath,
  getResourceContentPath,
} from './resource';
import {store, updateRefs} from './store';
import {postToApi, putToApi} from './util/api';
import {Menu, MenuItem} from './util/ui';
import type {ResourceCreateRequest} from '../server/api';
import {Scene, SceneActions} from '../server/store/scene';

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
        <RevertConstructItem />
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

  async _submitRequest(): Promise<void> {
    const state = store.getState();
    const resource = state.resource;
    if (!(resource instanceof Scene && state.selection.size === 1)) {
      return;
    }
    const rootId = state.selection.values().next().value;
    const entity = resource.getEntity(rootId);
    const node = resource.getEntityHierarchyNode(rootId);
    if (!(entity && node && !resource.isInitialEntity(rootId))) {
      return;
    }
    const request: ResourceCreateRequest = {type: 'construct'};
    const response = await postToApi('/resource', request);
    const resourceId = response.id;
    const data = {
      name: this.state.name,
      description: this.state.description,
    };
    const json: Object = {entities: {exterior: {}}};
    const ids = new Map([[rootId, 'root']]);
    const map = {};
    node.applyToEntityIds(entityId => {
      const entity = resource.getEntity(entityId);
      if (!entity) {
        return;
      }
      const newId = entityId === rootId ? 'root' : entityId;
      json.entities[newId] = updateRefs(entity.toJSON(), ids, 'exterior');
      const edit: Object = {construct: resourceId};
      for (const key in entity.state) {
        if (key !== 'parent') {
          edit[key] = null;
        }
      }
      map[entityId] = edit;
    });
    delete json.entities.root.name;
    await Promise.all([
      putToApi(getResourceMetadataPath(resourceId), data),
      putToApi(getResourceContentPath(resourceId), json, false),
    ]);
    store.dispatch(SceneActions.editEntities.create(map));
  }
}

const SaveConstructItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="construct.save" defaultMessage="Save" />
  </MenuItem>
));

const RevertConstructItem = ReactRedux.connect(state => ({
  disabled: true,
}))((props: {disabled: boolean}) => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="construct.revert" defaultMessage="Revert" />
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
