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
import {RenderCanvas} from './renderer/canvas';
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
        <div className="flex-grow-1 border-left border-secondary">
          <RenderCanvas />
        </div>
      </div>
    );
  }
}

const PageTabs = ReactRedux.connect(state => ({
  resource: state.resource,
  selectedPage: state.page,
  draggingPage: state.draggingPage,
}))(
  (props: {
    locale: string,
    resource: ?Resource,
    selectedPage: string,
    draggingPage: ?string,
  }) => {
    const resource = props.resource;
    if (!(resource instanceof Scene)) {
      return null;
    }
    let previousOrder = resource.entityHierarchy.lowestChildOrder - 2;
    const highestOrder = resource.entityHierarchy.highestChildOrder;
    return (
      <Nav tabs className="pt-2 bg-black">
        {resource.entityHierarchy.children.map(node => {
          const entity = node.entity;
          if (!entity) {
            return null; // shouldn't happen
          }
          const entityOrder = entity.getOrder();
          const preOrder = (previousOrder + entityOrder) / 2;
          previousOrder = entityOrder;
          const removable = !resource.isInitialEntity(entity.id);
          return (
            <NavItem
              key={entity.id}
              className="position-relative"
              draggable
              onDragStart={event => {
                event.dataTransfer.setData('text', entity.id);
                store.dispatch(StoreActions.setDraggingPage.create(entity.id));
              }}
              onDragEnd={event => {
                store.dispatch(StoreActions.setDraggingPage.create(null));
              }}>
              {props.draggingPage ? (
                <ReorderTarget
                  draggingPage={props.draggingPage}
                  order={preOrder}
                />
              ) : null}
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
              {props.draggingPage && entityOrder === highestOrder ? (
                <ReorderTarget
                  draggingPage={props.draggingPage}
                  after={true}
                  order={entityOrder + 1}
                />
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
                    name: resource.entityHierarchy.getUniqueName(
                      renderText(
                        <FormattedMessage
                          id="new.page.name"
                          defaultMessage="Page"
                        />,
                        props.locale,
                      ),
                      resource.getInitialPageCount() + 1,
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
  },
);

function ReorderTarget(props: {
  draggingPage: string,
  after?: boolean,
  order: number,
}) {
  if (!isDroppable(props.draggingPage, props.order)) {
    return null;
  }
  const baseClass = `page-reorder-target${props.after ? ' after' : ' before'}`;
  return (
    <div
      className={baseClass}
      onDragEnter={event => {
        event.target.className = baseClass + ' visible';
      }}
      onDragLeave={event => {
        event.target.className = baseClass;
      }}
      onDrop={event => {
        event.target.className = baseClass;
        store.dispatch(
          SceneActions.editEntities.create({
            [props.draggingPage]: {order: props.order},
          }),
        );
      }}
    />
  );
}

function isDroppable(draggingPage: string, order: number): boolean {
  const resource = store.getState().resource;
  if (!(resource instanceof Scene)) {
    return false;
  }
  const entity = resource.getEntity(draggingPage);
  if (!entity || entity.getParent()) {
    return false;
  }
  return resource.entityHierarchy.entityWillMove(draggingPage, order);
}
