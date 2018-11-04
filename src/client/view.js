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
import {DEFAULT_PAGE_SIZE, StoreActions, store, createUuid} from './store';
import {EntityName} from './entity';
import {
  Menu,
  Submenu,
  MenuItem,
  Shortcut,
  ShortcutHandler,
  FrameShortcutHandler,
  renderText,
} from './util/ui';
import {RenderCanvas} from './renderer/canvas';
import type {Renderer} from './renderer/util';
import type {Resource} from '../server/store/resource';
import {Scene, SceneActions} from '../server/store/scene';

/**
 * The view menu dropdown.
 */
export class ViewDropdown extends React.Component<{}, {}> {
  render() {
    return (
      <Menu label={<FormattedMessage id="view.title" defaultMessage="View" />}>
        <MenuItem
          shortcut={new Shortcut(192)}
          onClick={() =>
            store.dispatch(StoreActions.setPagePosition.create(0.0, 0.0))
          }>
          <FormattedMessage id="view.recenter" defaultMessage="Recenter" />
        </MenuItem>
        <Submenu
          label={<FormattedMessage id="view.zoom" defaultMessage="Zoom" />}>
          <MenuItem
            shortcut={new Shortcut('3')}
            onClick={() =>
              store.dispatch(
                StoreActions.setPageSize.create(DEFAULT_PAGE_SIZE * 0.25),
              )
            }>
            <FormattedMessage id="view.zoom.4_1" defaultMessage="4:1" />
          </MenuItem>
          <MenuItem
            shortcut={new Shortcut('2')}
            onClick={() =>
              store.dispatch(
                StoreActions.setPageSize.create(DEFAULT_PAGE_SIZE * 0.5),
              )
            }>
            <FormattedMessage id="view.zoom.2_1" defaultMessage="2:1" />
          </MenuItem>
          <MenuItem
            shortcut={new Shortcut('1')}
            onClick={() =>
              store.dispatch(StoreActions.setPageSize.create(DEFAULT_PAGE_SIZE))
            }>
            <FormattedMessage id="view.zoom.1_1" defaultMessage="1:1" />
          </MenuItem>
          <MenuItem
            shortcut={new Shortcut('2', Shortcut.SHIFT)}
            onClick={() =>
              store.dispatch(
                StoreActions.setPageSize.create(DEFAULT_PAGE_SIZE * 2.0),
              )
            }>
            <FormattedMessage id="view.zoom.1_2" defaultMessage="1:2" />
          </MenuItem>
          <MenuItem
            shortcut={new Shortcut('3', Shortcut.SHIFT)}
            onClick={() =>
              store.dispatch(
                StoreActions.setPageSize.create(DEFAULT_PAGE_SIZE * 4.0),
              )
            }>
            <FormattedMessage id="view.zoom.1_4" defaultMessage="1:4" />
          </MenuItem>
          <PanShortcutHandler keyCode={38} dx={0.0} dy={1.0} />
          <PanShortcutHandler keyCode={37} dx={-1.0} dy={0.0} />
          <PanShortcutHandler keyCode={40} dx={0.0} dy={-1.0} />
          <PanShortcutHandler keyCode={39} dx={1.0} dy={0.0} />
        </Submenu>
      </Menu>
    );
  }
}

function PanShortcutHandler(props: {keyCode: number, dx: number, dy: number}) {
  return (
    <FrameShortcutHandler
      shortcut={new Shortcut(props.keyCode)}
      onFrame={elapsed => {
        const state = store.getState();
        const pageState = state.pageStates.get(state.page) || {};
        const amount = (pageState.size || DEFAULT_PAGE_SIZE) * elapsed;
        store.dispatch(
          StoreActions.setPagePosition.create(
            (pageState.x || 0) + amount * props.dx,
            (pageState.y || 0) + amount * props.dy,
          ),
        );
      }}
    />
  );
}

/**
 * The 2D scene view.
 */
export class SceneView extends React.Component<
  {locale: string, setRenderer: (?Renderer) => void},
  {},
> {
  render() {
    return (
      <div className="flex-grow-1 d-flex flex-column">
        <PageTabs locale={this.props.locale} />
        <div
          className={
            'flex-grow-1 border-left border-secondary position-relative'
          }>
          <RenderCanvas setRenderer={this.props.setRenderer} />
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
          const entity = node.id && resource.getEntity(node.id);
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
        <ShortcutHandler
          shortcut={new Shortcut(33)} // page up
          onPress={() => {
            const index = resource.entityHierarchy.getChildIndex(
              props.selectedPage,
            );
            if (index > 0) {
              store.dispatch(
                StoreActions.setPage.create(
                  resource.entityHierarchy.children[index - 1].id || '',
                ),
              );
            }
          }}
        />
        <ShortcutHandler
          shortcut={new Shortcut(34)} // page down
          onPress={() => {
            const index = resource.entityHierarchy.getChildIndex(
              props.selectedPage,
            );
            if (index < resource.entityHierarchy.children.length - 1) {
              store.dispatch(
                StoreActions.setPage.create(
                  resource.entityHierarchy.children[index + 1].id || '',
                ),
              );
            }
          }}
        />
        <ShortcutHandler
          shortcut={new Shortcut(36)} // home
          onPress={() => {
            const index = resource.entityHierarchy.getChildIndex(
              props.selectedPage,
            );
            if (index > 0) {
              store.dispatch(
                StoreActions.setPage.create(
                  resource.entityHierarchy.children[0].id || '',
                ),
              );
            }
          }}
        />
        <ShortcutHandler
          shortcut={new Shortcut(35)} // end
          onPress={() => {
            const index = resource.entityHierarchy.getChildIndex(
              props.selectedPage,
            );
            const lastIndex = resource.entityHierarchy.children.length - 1;
            if (index < lastIndex) {
              store.dispatch(
                StoreActions.setPage.create(
                  resource.entityHierarchy.children[lastIndex].id || '',
                ),
              );
            }
          }}
        />
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
