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
import {SceneActions} from '../server/store/scene';
import {Menu, MenuItem, Submenu} from './util/ui';

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
                SceneActions.editEntities.create({[createUuid()]: {}}),
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
 * The entity tree view.
 */
export class EntityTree extends React.Component<{}, {}> {
  render() {
    return <div className="entity-tree" />;
  }
}
