/**
 * Components related to entities.
 *
 * @module client/entity
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {DropdownItem} from 'reactstrap';
import {StoreActions, store, createUuid, centerPageOnSelection} from './store';
import type {ComponentData} from './component';
import {EditItems} from './edit';
import {GeometryComponents} from './geometry/components';
import {SensorCategory, SensorComponents} from './sensor/components';
import {EffectorCategory, EffectorComponents} from './effector/components';
import {CircuitCategories, CircuitComponents} from './circuit/components';
import type {Renderer} from './renderer/util';
import {Menu, MenuItem, Submenu, ContextMenu, renderText} from './util/ui';
import type {Resource, Entity} from '../server/store/resource';
import {EntityHierarchyNode, Scene, SceneActions} from '../server/store/scene';
import type {Vector2, Transform} from '../server/store/math';
import {
  vec2,
  invertTransform,
  composeTransforms,
  simplifyTransform,
  boundsContainPoint,
} from '../server/store/math';

const EntityLabel = (
  <FormattedMessage id="entity.title" defaultMessage="Entity" />
);

/**
 * The entity menu dropdown.
 */
export class EntityDropdown extends React.Component<{locale: string}, {}> {
  render() {
    return (
      <Menu label={EntityLabel} omitChildrenWhenClosed={true}>
        <EntityMenuItems
          locale={this.props.locale}
          createEntity={this._createEntity}
        />
      </Menu>
    );
  }

  _createEntity = (label: React.Element<any>, state: Object) => {
    createEntity(label, this.props.locale, state, getPageTransform());
  };
}

function getPageTransform(): Transform {
  const storeState = store.getState();
  const pageState = storeState.pageStates.get(storeState.page) || {};
  const x: number = pageState.x || 0.0;
  const y: number = pageState.y || 0.0;
  return {translation: {x, y}};
}

function EntityMenuItems(props: {
  locale: string,
  createEntity: (React.Element<any>, Object) => void,
}) {
  const groupLabel = (
    <FormattedMessage id="entity.group" defaultMessage="Group" />
  );
  const textLabel = <FormattedMessage id="entity.text" defaultMessage="Text" />;
  return [
    <MenuItem key="group" onClick={() => props.createEntity(groupLabel, {})}>
      {groupLabel}
    </MenuItem>,
    <MenuItem
      key="text"
      onClick={() =>
        props.createEntity(textLabel, {
          textRenderer: {
            text: renderText(textLabel, props.locale),
            order: 1,
          },
        })
      }>
      {textLabel}
    </MenuItem>,
    <ShapeMenu key="shape" createEntity={props.createEntity} />,
    <ModuleMenu key="module" createEntity={props.createEntity} />,
    <SensorMenu key="sensor" createEntity={props.createEntity} />,
    <EffectorMenu key="effector" createEntity={props.createEntity} />,
  ];
}

function ShapeMenu(props: {
  createEntity: (React.Element<any>, Object) => void,
}) {
  const entries: [string, ComponentData][] = (Object.entries(
    GeometryComponents,
  ): [string, any][]);
  return (
    <Submenu
      label={<FormattedMessage id="entity.shape" defaultMessage="Shape" />}>
      {entries.map(([name, data]) =>
        data.category ? (
          <MenuItem
            key={name}
            onClick={() =>
              props.createEntity(data.label, {
                [name]: {order: 1},
                shapeRenderer: {order: 2},
                shapeCollider: {order: 3},
                rigidBody: {order: 4},
              })
            }>
            {data.label}
          </MenuItem>
        ) : null,
      )}
    </Submenu>
  );
}

function SensorMenu(props: {
  createEntity: (React.Element<any>, Object) => void,
}) {
  if (store.getState().page !== 'exterior') {
    return null;
  }
  const entries: [string, ComponentData][] = (Object.entries(
    SensorComponents,
  ): [string, any][]);
  return (
    <Submenu label={SensorCategory.sensor.label}>
      {entries.map(([name, data]) =>
        data.category ? (
          <MenuItem
            key={name}
            onClick={() =>
              props.createEntity(data.label, {
                [name]: {order: 1},
                sensorRenderer: {order: 2},
              })
            }>
            {data.label}
          </MenuItem>
        ) : null,
      )}
    </Submenu>
  );
}

function EffectorMenu(props: {
  createEntity: (React.Element<any>, Object) => void,
}) {
  if (store.getState().page !== 'exterior') {
    return null;
  }
  const entries: [string, ComponentData][] = (Object.entries(
    EffectorComponents,
  ): [string, any][]);
  return (
    <Submenu label={EffectorCategory.effector.label}>
      {entries.map(([name, data]) =>
        data.category ? (
          <MenuItem
            key={name}
            onClick={() =>
              props.createEntity(data.label, {
                [name]: {order: 1},
                effectorRenderer: {order: 2},
              })
            }>
            {data.label}
          </MenuItem>
        ) : null,
      )}
    </Submenu>
  );
}

function ModuleMenu(props: {
  createEntity: (React.Element<any>, Object) => void,
}) {
  if (store.getState().page !== 'interior') {
    return null;
  }
  const entries: [string, ComponentData][] = (Object.entries(
    CircuitComponents,
  ): [string, any][]);
  const categories: Map<string, [string, ComponentData][]> = new Map();
  for (const [name, data] of entries) {
    const category = data.category;
    if (!category) {
      continue;
    }
    let array = categories.get(category);
    if (!array) {
      categories.set(category, (array = []));
    }
    array.push([name, data]);
  }
  return (
    <Submenu
      label={<FormattedMessage id="entity.module" defaultMessage="Module" />}>
      {Array.from(categories.entries()).map(([name, components]) => (
        <Submenu key={name} label={CircuitCategories[name].label}>
          {components.map(([name, data]) => (
            <MenuItem
              key={name}
              onClick={() =>
                props.createEntity(data.label, {
                  [name]: {order: 1},
                  moduleRenderer: {order: 2},
                })
              }>
              {data.label}
            </MenuItem>
          ))}
        </Submenu>
      ))}
    </Submenu>
  );
}

/**
 * Creates an entity on the page.
 *
 * @param label the base name of the entity.
 * @param locale the locale to use for translation.
 * @param state the entity state.
 * @param transform the entity transform.
 * @return the id of the newly created entity, if successful.
 */
export function createEntity(
  label: React.Element<any>,
  locale: string,
  state: Object,
  transform: Transform,
): ?string {
  const storeState = store.getState();
  const resource = storeState.resource;
  if (!(resource instanceof Scene)) {
    return;
  }
  const pageNode = resource.entityHierarchy.getChild(storeState.page);
  if (!pageNode) {
    return;
  }
  const id = createUuid();
  store.dispatch(
    SceneActions.editEntities.create({
      [id]: Object.assign(
        {
          parent: {ref: storeState.page},
          name: pageNode.getUniqueName(renderText(label, locale)),
          order: pageNode.highestChildOrder + 1,
          transform,
        },
        state,
      ),
    }),
  );
  return id;
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
    case 'inputBus':
      return CircuitComponents.inputBus.label;
    case 'outputBus':
      return CircuitComponents.outputBus.label;
    default:
      return props.entity.id;
  }
}

/**
 * The tree view of the entities on the page.
 */
export const EntityTree = ReactRedux.connect(state => {
  let root: ?EntityHierarchyNode;
  const resource = state.resource;
  if (resource instanceof Scene) {
    root = resource.entityHierarchy.getChild(state.page);
  }
  return {root};
})(
  (props: {
    root: ?EntityHierarchyNode,
    renderer: ?Renderer,
    openEntityMenu: Vector2 => void,
  }) => {
    const root = props.root;
    if (!root) {
      return null;
    }
    return (
      <div
        className="entity-tree"
        onMouseDown={event => {
          if (store.getState().selection.size > 0) {
            // deselect
            store.dispatch(StoreActions.select.create({}));
          }
        }}
        onDrop={event => {
          event.stopPropagation();
          const page = store.getState().page;
          if (isDroppable(page, null, root.highestChildOrder)) {
            drop(page, null, root.highestChildOrder);
          }
        }}
        onContextMenu={event => {
          event.preventDefault();
          props.openEntityMenu(vec2(event.clientX, event.clientY));
        }}>
        <EntityTreeChildren node={root} renderer={props.renderer} />
      </div>
    );
  },
);

function EntityTreeChildren(props: {
  node: EntityHierarchyNode,
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
          node={child}
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

const EntityTreeNode = ReactRedux.connect((state, ownProps) => ({
  expanded: state.expanded.has(ownProps.node.id),
  selected: state.selection.has(ownProps.node.id),
  dragging: state.draggingSelection,
}))(
  (props: {
    node: EntityHierarchyNode,
    renderer: ?Renderer,
    previousOrder: ?number,
    nextOrder: ?number,
    expanded: boolean,
    selected: boolean,
    dragging: boolean,
  }) => {
    const resource = store.getState().resource;
    if (!(resource instanceof Scene)) {
      return null;
    }
    const entity = resource.getEntity(props.node.id);
    if (!entity) {
      return null;
    }
    const parent = entity.getParent();
    if (!parent) {
      return null;
    }
    const baseClass = `pl-1 position-relative${
      props.selected ? ' bg-dark' : ''
    }`;
    return (
      <div className="d-flex">
        <div className="entity-expand-container">
          {props.node.children.length > 0 ? (
            <div
              className={props.expanded ? 'entity-contract' : 'entity-expand'}
              onMouseDown={event => event.stopPropagation()}
              onClick={event =>
                store.dispatch(
                  StoreActions.setExpanded.create({
                    [entity.id]: !props.expanded,
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
              const state = store.getState();
              const selection = state.selection;
              if (event.shiftKey && selection.size > 0) {
                const resource = state.resource;
                if (!(resource instanceof Scene)) {
                  return;
                }
                const root = resource.getEntityHierarchyNode(state.page);
                if (!root) {
                  return;
                }
                const map = {};
                let adding = false;
                let complete = false;
                root.applyToEntityIds(otherId => {
                  if (complete) {
                    return false;
                  }
                  if (selection.has(otherId) || otherId === entity.id) {
                    map[otherId] = true;
                    if (adding) {
                      complete = true;
                      return false;
                    } else {
                      adding = true;
                    }
                  } else if (adding) {
                    map[otherId] = true;
                  }
                });
                store.dispatch(StoreActions.select.create(map));
              } else if (event.ctrlKey) {
                store.dispatch(
                  StoreActions.select.create(
                    {[entity.id]: !props.selected},
                    true,
                  ),
                );
              } else if (!selection.has(entity.id)) {
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
                beforeOrder={props.node.order}
                afterOrder={props.previousOrder}
              />
            ) : null}
            <EntityName entity={entity} />
            {props.dragging && props.nextOrder == null ? (
              <ReorderTarget
                parentId={parent.ref}
                after={true}
                afterOrder={props.node.order}
                beforeOrder={null}
              />
            ) : null}
          </div>
          {props.expanded ? (
            <EntityTreeChildren node={props.node} renderer={props.renderer} />
          ) : null}
        </div>
      </div>
    );
  },
);

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

/**
 * The entity context menu.
 */
export const EntityMenu = ReactRedux.connect(state => {
  return {};
})(
  (props: {
    locale: string,
    renderer: ?Renderer,
    position: Vector2,
    close: () => void,
  }) => {
    let transform: Transform;
    const renderer = props.renderer;
    if (renderer) {
      const translation = renderer.getEventPosition(
        props.position.x,
        props.position.y,
      );
      if (boundsContainPoint(renderer.getCameraBounds(), translation)) {
        transform = {translation};
      }
    }
    if (!transform) {
      transform = getPageTransform();
    }
    return (
      <ContextMenu position={props.position} close={props.close}>
        <Submenu label={EntityLabel}>
          <EntityMenuItems
            locale={props.locale}
            createEntity={(label, state) => {
              createEntity(label, props.locale, state, transform);
            }}
          />
        </Submenu>
        <DropdownItem divider />
        <EditItems renderer={props.renderer} />
      </ContextMenu>
    );
  },
);
