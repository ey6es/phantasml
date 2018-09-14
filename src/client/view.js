/**
 * Components related to viewing.
 *
 * @module client/view
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Nav, NavItem, NavLink, Button} from 'reactstrap';
import {StoreActions, store, createUuid} from './store';
import {EntityName} from './entity';
import {Menu, renderText} from './util/ui';
import type {Resource} from '../server/store/resource';
import {Scene, SceneActions} from '../server/store/scene';

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
export class SceneView extends React.Component<{locale: string}, {}> {
  render() {
    return (
      <div className="flex-grow-1 d-flex flex-column">
        <PageTabs locale={this.props.locale} />
        <div className="flex-grow-1 border-left border-secondary" />
      </div>
    );
  }
}

const PageTabs = ReactRedux.connect(state => ({
  resource: state.resource,
  selectedPage: state.page,
}))((props: {locale: string, resource: ?Resource, selectedPage: string}) => {
  const resource = props.resource;
  if (!(resource instanceof Scene)) {
    return null;
  }
  return (
    <Nav tabs className="pt-1 bg-black">
      {resource.entityHierarchy.children.map(node => {
        const entity = node.entity;
        if (!entity) {
          return null; // shouldn't happen
        }
        const removable = !resource.isInitialEntity(entity.id);
        return (
          <NavItem key={entity.id} className="position-relative">
            <NavLink
              className={removable ? 'pr-5' : null}
              active={entity.id === props.selectedPage}
              onClick={() =>
                store.dispatch(StoreActions.setPage.create(entity.id))
              }>
              <EntityName entity={entity} />
            </NavLink>
            {removable ? (
              <Button
                className="close remove-page"
                onClick={() =>
                  store.dispatch(
                    SceneActions.editEntities.create({[entity.id]: null}),
                  )
                }>
                &times;
              </Button>
            ) : null}
          </NavItem>
        );
      })}
      <NavItem>
        <NavLink
          className="new-page"
          onClick={() =>
            store.dispatch(
              SceneActions.editEntities.create({
                [createUuid()]: {
                  name: renderText(
                    <FormattedMessage
                      id="page.new"
                      defaultMessage="New Page"
                    />,
                    props.locale,
                  ),
                  order: resource.entityHierarchy.highestChildOrder + 1,
                },
              }),
            )
          }>
          +
        </NavLink>
      </NavItem>
    </Nav>
  );
});
