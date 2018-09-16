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
  let root: ?EntityHierarchyNode;
  for (const child of resource.entityHierarchy.children) {
    if (child.id === props.page) {
      root = child;
      break;
    }
  }
  return (
    <div
      className="entity-tree"
      onMouseDown={event => {
        if (!event.defaultPrevented && props.selection.size > 0) {
          // deselect
          store.dispatch(StoreActions.select.create({}));
        }
      }}>
      {root ? (
        <EntityTreeChildren
          root={root}
          node={root}
          selection={props.selection}
        />
      ) : null}
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
      {children.map(child => (
        <EntityTreeNode
          key={child.id}
          root={props.root}
          node={child}
          selection={props.selection}
        />
      ))}
    </div>
  );
}

function EntityTreeNode(props: {
  root: EntityHierarchyNode,
  node: EntityHierarchyNode,
  selection: Set<string>,
}) {
  const entity = props.node.entity;
  if (!entity) {
    return null; // shouldn't happen
  }
  const selected = props.selection.has(entity.id);
  return (
    <div>
      <div
        className={`entity-tree-node${selected ? ' bg-dark' : ''}`}
        onMouseDown={event => {
          event.preventDefault();
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
        }}>
        <EntityName entity={entity} />
      </div>
      <EntityTreeChildren
        root={props.root}
        node={props.node}
        selection={props.selection}
      />
    </div>
  );
}
