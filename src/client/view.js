/**
 * Components related to viewing.
 *
 * @module client/view
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Nav, NavItem, NavLink} from 'reactstrap';
import {StoreActions, store} from './store';
import {EntityName} from './entity';
import {Menu} from './util/ui';
import type {Resource} from '../server/store/resource';
import {Scene} from '../server/store/scene';

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
    return (
      <div className="flex-grow-1">
        <PageTabs />
      </div>
    );
  }
}

const PageTabs = ReactRedux.connect(state => ({
  resource: state.resource,
  selectedPage: state.page,
}))((props: {resource: ?Resource, selectedPage: string}) => (
  <Nav tabs>
    {props.resource instanceof Scene
      ? props.resource.entityHierarchy.children.map(node => {
          const entity = node.entity;
          if (!entity) {
            return null; // shouldn't happen
          }
          return (
            <NavItem key={entity.id}>
              <NavLink
                active={entity.id === props.selectedPage}
                onClick={() =>
                  store.dispatch(StoreActions.setPage.create(entity.id))
                }>
                <EntityName entity={entity} />
              </NavLink>
            </NavItem>
          );
        })
      : null}
  </Nav>
));
