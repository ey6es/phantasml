/**
 * Components related to viewing.
 *
 * @module client/view
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Nav, NavItem, NavLink, Button, DropdownItem} from 'reactstrap';
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
import type {UserGetPreferencesResponse} from '../server/api';
import type {Resource} from '../server/store/resource';
import type {EntityHierarchyNode} from '../server/store/scene';
import {Scene, SceneActions} from '../server/store/scene';
import {timesEquals, plus, boundsContain} from '../server/store/math';

/**
 * The view menu dropdown.
 */
export class ViewDropdown extends React.Component<{renderer: ?Renderer}, {}> {
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
            shortcut={new Shortcut(109, 0, [new Shortcut(173)])}
            onClick={() => zoomPage(1)}>
            <FormattedMessage id="view.zoom_out" defaultMessage="Zoom Out" />
          </MenuItem>
          <MenuItem
            shortcut={new Shortcut(107, 0, [new Shortcut(61, Shortcut.SHIFT)])}
            onClick={() => zoomPage(-1)}>
            <FormattedMessage id="view.zoom_in" defaultMessage="Zoom In" />
          </MenuItem>
          <MenuItem
            shortcut={new Shortcut('J', Shortcut.CTRL | Shortcut.SHIFT)}
            onClick={() => {
              const renderer = this.props.renderer;
              const state = store.getState();
              const resource = state.resource;
              if (!(renderer && resource instanceof Scene)) {
                return;
              }
              const totalBounds = resource.getTotalBounds(state.page);
              if (!totalBounds) {
                return;
              }
              const cameraBounds = renderer.getCameraBounds();
              if (boundsContain(cameraBounds, totalBounds)) {
                return;
              }
              const center = timesEquals(
                plus(totalBounds.min, totalBounds.max),
                0.5,
              );
              const size = Math.max(
                totalBounds.max.y - totalBounds.min.y,
                (totalBounds.max.x - totalBounds.min.x) /
                  renderer.camera.aspect,
              );
              store.dispatch(
                StoreActions.setPagePosition.create(center.x, center.y),
              );
              store.dispatch(StoreActions.setPageSize.create(size));
            }}>
            <FormattedMessage id="view.fit_all" defaultMessage="Fit" />
          </MenuItem>
          <DropdownItem divider />
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

/**
 * Zooms the current page in or out by the specified amount.
 *
 * @param amount the amount to zoom (positive for "out").
 */
export function zoomPage(amount: number) {
  const state = store.getState();
  const pageState = state.pageStates.get(state.page);
  const oldSize = (pageState && pageState.size) || DEFAULT_PAGE_SIZE;
  const newSize = oldSize * Math.pow(1.01, amount * 3);
  store.dispatch(StoreActions.setPageSize.create(newSize));
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
  {
    locale: string,
    preferences: UserGetPreferencesResponse,
    setRenderer: (?Renderer) => void,
    fontImage: HTMLImageElement,
    setMousePositionElement: (?HTMLElement) => void,
  },
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
          <RenderCanvas
            preferences={this.props.preferences}
            setRenderer={this.props.setRenderer}
            fontImage={this.props.fontImage}
            setMousePositionElement={this.props.setMousePositionElement}
          />
        </div>
      </div>
    );
  }
}

const PageTabs = ReactRedux.connect(state => ({
  root: state.resource instanceof Scene ? state.resource.entityHierarchy : null,
  selectedPage: state.page,
  draggingPage: state.draggingPage,
}))(
  (props: {
    locale: string,
    root: ?EntityHierarchyNode,
    selectedPage: string,
    draggingPage: ?string,
  }) => {
    const root = props.root;
    const resource = store.getState().resource;
    if (!(root && resource instanceof Scene)) {
      return null;
    }
    let previousOrder = root.lowestChildOrder - 2;
    const highestOrder = root.highestChildOrder;
    return (
      <Nav tabs className="pt-2 bg-black">
        {root.children.map(node => {
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
                    name: root.getUniqueName(
                      renderText(
                        <FormattedMessage
                          id="new.page.name"
                          defaultMessage="Page"
                        />,
                        props.locale,
                      ),
                      resource.getInitialPageCount() + 1,
                    ),
                    order: root.highestChildOrder + 1,
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
            const index = root.getChildIndex(props.selectedPage);
            if (index > 0) {
              store.dispatch(
                StoreActions.setPage.create(root.children[index - 1].id || ''),
              );
            }
          }}
        />
        <ShortcutHandler
          shortcut={new Shortcut(34)} // page down
          onPress={() => {
            const index = root.getChildIndex(props.selectedPage);
            if (index < root.children.length - 1) {
              store.dispatch(
                StoreActions.setPage.create(root.children[index + 1].id || ''),
              );
            }
          }}
        />
        <ShortcutHandler
          shortcut={new Shortcut(36)} // home
          onPress={() => {
            const index = root.getChildIndex(props.selectedPage);
            if (index > 0) {
              store.dispatch(
                StoreActions.setPage.create(root.children[0].id || ''),
              );
            }
          }}
        />
        <ShortcutHandler
          shortcut={new Shortcut(35)} // end
          onPress={() => {
            const index = root.getChildIndex(props.selectedPage);
            const lastIndex = root.children.length - 1;
            if (index < lastIndex) {
              store.dispatch(
                StoreActions.setPage.create(root.children[lastIndex].id || ''),
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
