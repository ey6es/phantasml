/**
 * Components related to entities.
 *
 * @module client/entity
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {StoreActions, store, createUuid, centerPageOnSelection} from './store';
import type {ComponentData} from './component';
import {GeometryComponents} from './geometry/components';
import type {Renderer} from './renderer/util';
import {Menu, MenuItem, Submenu, renderText} from './util/ui';
import type {Resource, Entity} from '../server/store/resource';
import {EntityHierarchyNode, Scene, SceneActions} from '../server/store/scene';
import {
  invertTransform,
  composeTransforms,
  simplifyTransform,
} from '../server/store/math';

function ShapeMenu(props: {
  createEntity: (React.Element<any>, Object) => void,
}) {
  const entries: [string, ComponentData][] = (Object.entries(
    GeometryComponents,
  ): [string, any][]);
  return (
    <Submenu
      label={<FormattedMessage id="entity.shape" defaultMessage="Shape" />}>
      {entries.map(([name, data]) => (
        <MenuItem
          key={name}
          onClick={() =>
            props.createEntity(data.label, {
              [name]: {order: 1},
              shapeRenderer: {order: 2},
            })
          }>
          {data.label}
        </MenuItem>
      ))}
    </Submenu>
  );
}

/**
 * The entity menu dropdown.
 */
export class EntityDropdown extends React.Component<{locale: string}, {}> {
  render() {
    const groupLabel = (
      <FormattedMessage id="entity.group" defaultMessage="Group" />
    );
    return (
      <Menu
        label={<FormattedMessage id="entity.title" defaultMessage="Entity" />}
        omitChildrenWhenClosed={true}>
        <MenuItem onClick={() => this._createEntity(groupLabel)}>
          {groupLabel}
        </MenuItem>
        <ShapeMenu createEntity={this._createEntity} />
      </Menu>
    );
  }

  _createEntity = (label: React.Element<any>, state: Object = {}) => {
    const storeState = store.getState();
    const resource = storeState.resource;
    if (!(resource instanceof Scene)) {
      return;
    }
    const pageNode = resource.entityHierarchy.getChild(storeState.page);
    if (!pageNode) {
      return;
    }
    store.dispatch(
      SceneActions.editEntities.create({
        [createUuid()]: Object.assign(
          {
            parent: {ref: storeState.page},
            name: pageNode.getUniqueName(renderText(label, this.props.locale)),
            order: pageNode.highestChildOrder + 1,
          },
          state,
        ),
      }),
    );
  };
}

/**
 * Renders the name of an entity.
 *
 * @param props the element properties.
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
 * The tree view of the entities on the page.
 */
export const EntityTree = ReactRedux.connect(state => ({
  resource: state.resource,
  page: state.page,
  expanded: state.expanded,
  selection: state.selection,
  dragging: state.draggingSelection,
}))(
  (props: {
    resource: ?Resource,
    page: string,
    expanded: Set<string>,
    selection: Set<string>,
    dragging: boolean,
    renderer: ?Renderer,
  }) => {
    const resource = props.resource;
    if (!(resource instanceof Scene)) {
      return null; // shouldn't happen
    }
    // locate the page entity in the hierarchy
    const root = resource.entityHierarchy.getChild(props.page);
    if (!root) {
      return null; // shouldn't happen
    }
    return (
      <div
        className="entity-tree"
        onMouseDown={event => {
          if (props.selection.size > 0) {
            // deselect
            store.dispatch(StoreActions.select.create({}));
          }
        }}
        onDrop={event => {
          event.stopPropagation();
          if (isDroppable(props.page, null, root.highestChildOrder)) {
            drop(props.page, null, root.highestChildOrder);
          }
        }}>
        <EntityTreeChildren
          root={root}
          node={root}
          expanded={props.expanded}
          selection={props.selection}
          dragging={props.dragging}
          renderer={props.renderer}
        />
      </div>
    );
  },
);

function EntityTreeChildren(props: {
  root: EntityHierarchyNode,
  node: EntityHierarchyNode,
  expanded: Set<string>,
  selection: Set<string>,
  dragging: boolean,
  renderer: ?Renderer,
}) {
  const children = props.node.children;
  if (children.length === 0) {
    return null;
  }
  return (
    <div>
      {children.map((child, index) => (
        <EntityTreeNode
          key={child.id}
          root={props.root}
          node={child}
          expanded={props.expanded}
          selection={props.selection}
          dragging={props.dragging}
          renderer={props.renderer}
          previousOrder={index === 0 ? null : children[index - 1].order}
          nextOrder={
            index === children.length - 1 ? null : children[index + 1].order
          }
        />
      ))}
    </div>
  );
}

function EntityTreeNode(props: {
  root: EntityHierarchyNode,
  node: EntityHierarchyNode,
  expanded: Set<string>,
  selection: Set<string>,
  dragging: boolean,
  renderer: ?Renderer,
  previousOrder: ?number,
  nextOrder: ?number,
}) {
  const entity = props.node.entity;
  if (!entity) {
    return null; // shouldn't happen
  }
  const parent = entity.getParent();
  if (!parent) {
    return null; // also shouldn't happen
  }
  const selected = props.selection.has(entity.id);
  const baseClass = `pl-1 position-relative${selected ? ' bg-dark' : ''}`;
  const expanded = props.expanded.has(entity.id);
  return (
    <div className="d-flex">
      <div className="entity-expand-container">
        {props.node.children.length > 0 ? (
          <div
            className={expanded ? 'entity-contract' : 'entity-expand'}
            onMouseDown={event => event.stopPropagation()}
            onClick={event =>
              store.dispatch(
                StoreActions.setExpanded.create({
                  [entity.id]: !expanded,
                }),
              )
            }
          />
        ) : null}
      </div>
      <div className="flex-grow-1">
        <div
          className={baseClass}
          onMouseDown={event => {
            event.stopPropagation();
            if (event.shiftKey && props.selection.size > 0) {
              const map = {};
              let adding = false;
              props.root.applyToEntities(otherEntity => {
                if (
                  props.selection.has(otherEntity.id) ||
                  otherEntity.id === entity.id
                ) {
                  map[otherEntity.id] = true;
                  if (adding) {
                    return false;
                  } else {
                    adding = true;
                  }
                } else if (adding) {
                  map[otherEntity.id] = true;
                }
              });
              store.dispatch(StoreActions.select.create(map));
            } else if (event.ctrlKey) {
              store.dispatch(
                StoreActions.select.create({[entity.id]: !selected}, true),
              );
            } else if (!props.selection.has(entity.id)) {
              store.dispatch(StoreActions.select.create({[entity.id]: true}));
            }
          }}
          onDoubleClick={event => {
            props.renderer && centerPageOnSelection(props.renderer);
          }}
          draggable
          onDragStart={event => {
            event.dataTransfer.setData('text', entity.id);
            store.dispatch(StoreActions.setDraggingSelection.create(true));
          }}
          onDragEnd={event => {
            store.dispatch(StoreActions.setDraggingSelection.create(false));
          }}
          onDragEnter={event => {
            event.stopPropagation();
            if (isDroppable(entity.id, null, props.node.highestChildOrder)) {
              event.target.className = baseClass + ' entity-drag-hover';
            }
          }}
          onDragLeave={event => {
            event.stopPropagation();
            event.target.className = baseClass;
          }}
          onDrop={event => {
            event.stopPropagation();
            event.target.className = baseClass;
            if (isDroppable(entity.id, null, props.node.highestChildOrder)) {
              drop(entity.id, null, props.node.highestChildOrder);
            }
          }}>
          {props.dragging ? (
            <ReorderTarget
              parentId={parent.ref}
              beforeOrder={entity.getOrder()}
              afterOrder={props.previousOrder}
            />
          ) : null}
          <EntityName entity={entity} />
          {props.dragging && props.nextOrder == null ? (
            <ReorderTarget
              parentId={parent.ref}
              after={true}
              afterOrder={entity.getOrder()}
              beforeOrder={null}
            />
          ) : null}
        </div>
        {expanded ? (
          <EntityTreeChildren
            root={props.root}
            node={props.node}
            expanded={props.expanded}
            selection={props.selection}
            dragging={props.dragging}
            renderer={props.renderer}
          />
        ) : null}
      </div>
    </div>
  );
}

function ReorderTarget(props: {
  parentId: string,
  after?: boolean,
  beforeOrder: ?number,
  afterOrder: ?number,
}) {
  if (!isDroppable(props.parentId, props.beforeOrder, props.afterOrder)) {
    return null;
  }
  const baseClass = `entity-reorder-target${
    props.after ? ' after' : ' before'
  }`;
  return (
    <div
      className={baseClass}
      onDragEnter={event => {
        event.stopPropagation();
        event.target.className = baseClass + ' visible';
      }}
      onDragLeave={event => {
        event.stopPropagation();
        event.target.className = baseClass;
      }}
      onDrop={event => {
        event.stopPropagation();
        event.target.className = baseClass;
        drop(props.parentId, props.beforeOrder, props.afterOrder);
      }}
    />
  );
}

function isDroppable(
  parentId: string,
  beforeOrder: ?number,
  afterOrder: ?number,
): boolean {
  const resource = store.getState().resource;
  if (!(resource instanceof Scene)) {
    return false;
  }
  const parentEntity = resource.getEntity(parentId);
  if (!parentEntity) {
    return false;
  }
  const selection = store.getState().selection;
  const parentLineage = resource.getEntityLineage(parentEntity);
  for (const entity of parentLineage) {
    if (selection.has(entity.id)) {
      return false; // can't parent to self or descendants
    }
  }
  for (const id of selection) {
    const entity = resource.getEntity(id);
    if (entity) {
      const parent = entity.getParent();
      if (!parent || parent.ref !== parentId) {
        return true; // reparenting something
      }
    }
  }
  // if we get here, we're just reordering; figure out if the order will change
  const parentNode = resource.entityHierarchy.getNode(parentLineage);
  if (!parentNode) {
    return false; // shouldn't happen
  }
  // see if everything's already in a contiguous block in the same order
  let lastChildIndex: ?number;
  for (const id of selection) {
    if (lastChildIndex == null) {
      lastChildIndex = parentNode.getChildIndex(id);
    } else {
      const child = parentNode.children[++lastChildIndex];
      if (!child || child.id !== id) {
        return true;
      }
    }
  }
  if (lastChildIndex == null) {
    return false; // shouldn't happen
  }
  const firstChildIndex = lastChildIndex - selection.size + 1;
  if (beforeOrder != null && afterOrder != null) {
    // moving to middle
    const previousChildNode = parentNode.children[firstChildIndex - 1];
    const nextChildNode = parentNode.children[lastChildIndex + 1];
    return (
      (previousChildNode && previousChildNode.order >= beforeOrder) ||
      (nextChildNode && nextChildNode.order <= afterOrder)
    );
  } else if (afterOrder != null) {
    // moving to end
    return lastChildIndex !== parentNode.children.length - 1;
  } else if (beforeOrder != null) {
    // moving to beginning
    return firstChildIndex !== 0;
  } else {
    throw new Error('Unbounded interval.');
  }
}

function drop(parentId: string, beforeOrder: ?number, afterOrder: ?number) {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const map = {};
  const parent = {ref: parentId};
  const selection = state.selection;
  let order: number;
  let orderIncrement: number;
  if (beforeOrder != null && afterOrder != null) {
    orderIncrement = (beforeOrder - afterOrder) / (selection.size + 1);
    order = afterOrder + orderIncrement;
  } else if (afterOrder != null) {
    order = afterOrder + 1;
    orderIncrement = 1;
  } else if (beforeOrder != null) {
    order = beforeOrder - selection.size;
    orderIncrement = 1;
  } else {
    throw new Error('Unbounded interval.');
  }
  const inverseParentTransform = invertTransform(
    resource.getWorldTransform(parentId),
  );
  for (const id of selection) {
    const transform = simplifyTransform(
      composeTransforms(inverseParentTransform, resource.getWorldTransform(id)),
    );
    map[id] = {parent, order, transform};
    order += orderIncrement;
  }
  store.dispatch(SceneActions.editEntities.create(map));
}
