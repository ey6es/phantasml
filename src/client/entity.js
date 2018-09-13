/**
 * Components related to entities.
 *
 * @module client/entity
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {store, createUuid} from './store';
import {Menu, MenuItem, Submenu} from './util/ui';
import type {Entity} from '../server/store/resource';
import {SceneActions} from '../server/store/scene';

/**
 * The entity menu dropdown.
 */
export class EntityDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu
        label={<FormattedMessage id="entity.title" defaultMessage="Entity" />}>
        <Submenu
          label={<FormattedMessage id="entity.new" defaultMessage="New" />}>
          <MenuItem
            onClick={() =>
              store.dispatch(
                SceneActions.editEntities.create({
                  [createUuid()]: {
                    parent: {ref: store.getState().page},
                  },
                }),
              )
            }>
            <FormattedMessage id="entity.empty" defaultMessage="Empty" />
          </MenuItem>
        </Submenu>
        {this.state.dialog}
      </Menu>
    );
  }
}

/**
 * Renders the name of an entity.
 *
 * @param props.entity the entity whose name should be rendered.
 */
export function EntityName(props: {entity: Entity}) {
  const name = props.entity.getName();
  if (name != null) {
    return name;
  }
  switch (props.entity.id) {
    case 'default':
      return (
        <FormattedMessage id="entity.name.default" defaultMessage="Default" />
      );
    case 'exterior':
      return (
        <FormattedMessage id="entity.name.exterior" defaultMessage="Exterior" />
      );
    case 'interior':
      return (
        <FormattedMessage id="entity.name.interior" defaultMessage="Interior" />
      );
    default:
      return props.entity.id;
  }
}

/**
 * The entity tree view.
 */
export class EntityTree extends React.Component<{}, {}> {
  render() {
    return <div className="entity-tree" />;
  }
}
