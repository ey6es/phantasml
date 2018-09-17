/**
 * Components related to entities.
 *
 * @module client/entity
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {StoreActions, store, createUuid} from './store';
import {Menu, MenuItem, Submenu, renderText} from './util/ui';
import type {Resource, Entity} from '../server/store/resource';
import {EntityHierarchyNode, Scene, SceneActions} from '../server/store/scene';

const ENTITY_TYPES = {
  group: {},
};

/**
 * The entity menu dropdown.
 */
export class EntityDropdown extends React.Component<
  {locale: string},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu
        label={<FormattedMessage id="entity.title" defaultMessage="Entity" />}>
        <Submenu
          label={<FormattedMessage id="entity.new" defaultMessage="New" />}>
          {Object.entries(ENTITY_TYPES).map(([type, state]) => (
            <MenuItem
              key={type}
              onClick={() => this._createEntity(type, (state: any))}>
              <EntityType type={type} />
            </MenuItem>
          ))}
        </Submenu>
        {this.state.dialog}
      </Menu>
    );
  }

  _createEntity(type: string, state: Object = {}) {
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
      SceneActions.editEntities.create(
        Object.assign(
          {
            [createUuid()]: {
              parent: {ref: storeState.page},
              name: pageNode.getUniqueName(
                renderText(<EntityType type={type} />, this.props.locale),
              ),
              order: pageNode.highestChildOrder + 1,
            },
          },
          state,
        ),
      ),
    );
  }
}

function EntityType(props: {type: string}) {
  switch (props.type) {
    case 'group':
      return <FormattedMessage id="entity.type.group" defaultMessage="Group" />;
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
 * The tree view of the entities on the page.
 */
export const EntityTree = ReactRedux.connect(state => ({
  resource: state.resource,
  page: state.page,
  selection: state.selection,
}))((props: {resource: ?Resource, page: string, selection: Set<string>}) => {
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
        if (isDroppable(props.page, null, root.highestChildOrder)) {
          event.stopPropagation();
          drop(props.page, null, root.highestChildOrder);
        }
      }}>
      <EntityTreeChildren root={root} node={root} selection={props.selection} />
    </div>
  );
});

function EntityTreeChildren(props: {
  root: EntityHierarchyNode,
  node: EntityHierarchyNode,
  selection: Set<string>,
}) {
  const children = props.node.children;
  if (children.length === 0) {
    return null;
  }
  return (
    <div className="pl-2">
      {children.map((child, index) => (
        <EntityTreeNode
          key={child.id}
          root={props.root}
          node={child}
          selection={props.selection}
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
  selection: Set<string>,
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
  const baseClass = `position-relative${selected ? ' bg-dark' : ''}`;
  return (
    <div>
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
          } else {
            store.dispatch(StoreActions.select.create({[entity.id]: true}));
          }
        }}
        draggable
        onDragStart={event => {
          event.dataTransfer.setData('text', entity.id);
        }}
        onDragEnter={event => {
          if (isDroppable(entity.id, null, props.node.highestChildOrder)) {
            event.stopPropagation();
            event.target.className = baseClass + ' entity-drag-hover';
          }
        }}
        onDragLeave={event => {
          event.stopPropagation();
          event.target.className = baseClass;
        }}
        onDrop={event => {
          event.target.className = baseClass;
          if (isDroppable(entity.id, null, props.node.highestChildOrder)) {
            event.stopPropagation();
            drop(entity.id, null, props.node.highestChildOrder);
          }
        }}>
        <ReorderTarget
          parentId={parent.ref}
          beforeOrder={entity.getOrder()}
          afterOrder={props.previousOrder}
        />
        <EntityName entity={entity} />
        {props.nextOrder == null ? (
          <ReorderTarget
            parentId={parent.ref}
            after={true}
            afterOrder={entity.getOrder()}
            beforeOrder={null}
          />
        ) : null}
      </div>
      <EntityTreeChildren
        root={props.root}
        node={props.node}
        selection={props.selection}
      />
    </div>
  );
}

function ReorderTarget(props: {
  parentId: string,
  after?: boolean,
  beforeOrder: ?number,
  afterOrder: ?number,
}) {
  const baseClass = `entity-reorder-target${
    props.after ? ' after' : ' before'
  }`;
  return (
    <div
      className={baseClass}
      onDragEnter={event => {
        if (isDroppable(props.parentId, props.beforeOrder, props.afterOrder)) {
          event.stopPropagation();
          event.target.className = baseClass + ' visible';
        }
      }}
      onDragLeave={event => {
        event.stopPropagation();
        event.target.className = baseClass;
      }}
      onDrop={event => {
        event.target.className = baseClass;
        if (isDroppable(props.parentId, props.beforeOrder, props.afterOrder)) {
          event.stopPropagation();
          drop(props.parentId, props.beforeOrder, props.afterOrder);
        }
      }}
    />
  );
}

function drop(parentId: string, beforeOrder: ?number, afterOrder: ?number) {}

function isDroppable(
  parentId: string,
  beforeOrder: ?number,
  afterOrder: ?number,
): boolean {
  return true;
}
