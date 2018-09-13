/**
 * Scene state model.
 *
 * @module server/store/scene
 * @flow
 */

import {Resource, Entity, addResourceTypeConstructor} from './resource';
import type {ResourceAction} from './resource';
import type {ResourceType} from '../api';

const LEAF_EXPAND_SIZE = 16;
const LEAF_COLLAPSE_SIZE = 8;

/**
 * Maps ids to entities in a tree structure, limiting the changed object size.
 */
class IdTreeNode {
  getEntity(id: string, depth: number = 0): ?Entity {
    throw new Error('Not implemented.');
  }
  editEntity(
    id: string,
    state: Object,
    depth: number = 0,
  ): [IdTreeNode, ?Entity, Entity] {
    throw new Error('Not implemented.');
  }
  addEntity(entity: Entity, depth: number = 0): IdTreeNode {
    throw new Error('Not implemented.');
  }
  removeEntity(id: string, depth: number = 0): [IdTreeNode, ?Entity] {
    throw new Error('Not implemented');
  }
  applyToEntities(op: Entity => void) {
    throw new Error('Not implemented.');
  }
  getEntityLineage(entity: ?Entity): Entity[] {
    if (!entity) {
      return []; // invalid lineage
    }
    const lineage = [entity];
    while (true) {
      const parent = entity.getParent();
      if (!parent) {
        return lineage;
      }
      entity = this.getEntity(parent.ref);
      if (!entity) {
        return [];
      }
      lineage.unshift(entity);
    }
    return lineage;
  }
}
class IdTreeLeafNode extends IdTreeNode {
  _entities: Map<string, Entity>;

  constructor(entities: Map<string, Entity> = new Map()) {
    super();
    this._entities = entities;
  }
  getEntity(id: string, depth: number = 0): ?Entity {
    return this._entities.get(id);
  }
  editEntity(
    id: string,
    state: Object,
    depth: number = 0,
  ): [IdTreeNode, ?Entity, Entity] {
    const oldEntity = this._entities.get(id);
    if (!oldEntity) {
      const newEntity = new Entity(id, state);
      return [this.addEntity(newEntity, depth), null, newEntity];
    }
    const newEntities = new Map(this._entities);
    const newEntity = new Entity(id, mergeEntityEdits(oldEntity.state, state));
    newEntities.set(id, newEntity);
    return [new IdTreeLeafNode(newEntities), oldEntity, newEntity];
  }
  addEntity(entity: Entity, depth: number = 0): IdTreeNode {
    const newEntities = new Map(this._entities);
    newEntities.set(entity.id, entity);
    if (newEntities.size > LEAF_EXPAND_SIZE) {
      // split into two internal nodes
      const evenEntities = new Map();
      const oddEntities = new Map();
      for (const [id, entity] of newEntities) {
        (isIdEven(id, depth) ? evenEntities : oddEntities).set(id, entity);
      }
      return new IdTreeInternalNode(
        new IdTreeLeafNode(evenEntities),
        new IdTreeLeafNode(oddEntities),
      );
    }
    return new IdTreeLeafNode(newEntities);
  }
  removeEntity(id: string, depth: number = 0): [IdTreeNode, ?Entity] {
    const entity = this._entities.get(id);
    if (!entity) {
      return [this, null];
    }
    const newEntities = new Map(this._entities);
    newEntities.delete(id);
    return [new IdTreeLeafNode(newEntities), entity];
  }
  applyToEntities(op: Entity => void) {
    for (const entity of this._entities.values()) {
      op(entity);
    }
  }
}
class IdTreeInternalNode extends IdTreeNode {
  _even: IdTreeNode;
  _odd: IdTreeNode;

  constructor(even: IdTreeNode, odd: IdTreeNode) {
    super();
    this._even = even;
    this._odd = odd;
  }
  getEntity(id: string, depth: number = 0): ?Entity {
    return (isIdEven(id, depth) ? this._even : this._odd).getEntity(
      id,
      depth + 1,
    );
  }
  editEntity(
    id: string,
    state: Object,
    depth: number = 0,
  ): [IdTreeNode, ?Entity, Entity] {
    let even = this._even;
    let odd = this._odd;
    let oldEntity: ?Entity;
    let newEntity: Entity;
    if (isIdEven(id, depth)) {
      [even, oldEntity, newEntity] = even.editEntity(id, state, depth + 1);
    } else {
      [odd, oldEntity, newEntity] = odd.editEntity(id, state, depth + 1);
    }
    return [new IdTreeInternalNode(even, odd), oldEntity, newEntity];
  }
  addEntity(entity: Entity, depth: number = 0): IdTreeNode {
    if (isIdEven(entity.id, depth)) {
      return new IdTreeInternalNode(
        this._even.addEntity(entity, depth + 1),
        this._odd,
      );
    } else {
      return new IdTreeInternalNode(
        this._even,
        this._odd.addEntity(entity, depth + 1),
      );
    }
  }
  removeEntity(id: string, depth: number = 0): [IdTreeNode, ?Entity] {
    let even = this._even;
    let odd = this._odd;
    let entity: ?Entity;
    if (isIdEven(id, depth)) {
      [even, entity] = even.removeEntity(id, depth + 1);
    } else {
      [odd, entity] = odd.removeEntity(id, depth + 1);
    }
    // collapse into leaf if children are small enough
    if (
      even instanceof IdTreeLeafNode &&
      odd instanceof IdTreeLeafNode &&
      even._entities.size + odd._entities.size < LEAF_COLLAPSE_SIZE
    ) {
      return [
        new IdTreeLeafNode(new Map([...even._entities, ...odd._entities])),
        entity,
      ];
    }
    return [new IdTreeInternalNode(even, odd), entity];
  }
  applyToEntities(op: Entity => void) {
    this._even.applyToEntities(op);
    this._odd.applyToEntities(op);
  }
}
function isIdEven(id: string, depth: number): boolean {
  return !(id.charCodeAt(id.length - depth - 1) & 1);
}

/**
 * Represents part of the entity parentage hierarchy.
 */
class EntityHierarchyNode {
  _entity: ?Entity;
  _children: EntityHierarchyNode[];

  /** Returns a reference to the entity, if any. */
  get entity(): ?Entity {
    return this._entity;
  }

  /** Returns a reference to the child array. */
  get children(): EntityHierarchyNode[] {
    return this._children;
  }

  constructor(entity: ?Entity = null, children: EntityHierarchyNode[] = []) {
    this._entity = entity;
    this._children = children;
  }

  addEntity(lineage: Entity[], depth: number = 0): EntityHierarchyNode {
    if (depth >= lineage.length) {
      return this; // invalid lineage
    }
    const entity = lineage[depth];
    let newChildren: EntityHierarchyNode[] = [];
    const nextDepth = depth + 1;
    if (nextDepth < lineage.length) {
      for (const child of this._children) {
        newChildren.push(
          child._entity === entity
            ? child.addEntity(lineage, nextDepth)
            : child,
        );
      }
    } else {
      const entityOrder = entity.getOrder();
      for (const child of this._children) {
        if (child._entity && entityOrder < child._entity.getOrder()) {
          newChildren.push(new EntityHierarchyNode(entity));
        }
        newChildren.push(child);
      }
      if (newChildren.length === this._children.length) {
        newChildren.push(new EntityHierarchyNode(entity));
      }
    }
    return new EntityHierarchyNode(this._entity, newChildren);
  }

  removeEntity(lineage: Entity[], depth: number = 0): EntityHierarchyNode {
    if (depth >= lineage.length) {
      return this; // invalid lineage
    }
    const entity = lineage[depth];
    const newChildren: EntityHierarchyNode[] = [];
    for (const child of this._children) {
      if (child._entity === entity) {
        const nextDepth = depth + 1;
        if (nextDepth < lineage.length) {
          newChildren.push(child.removeEntity(lineage, nextDepth));
        }
      } else {
        newChildren.push(child);
      }
    }
    return new EntityHierarchyNode(this._entity, newChildren);
  }
}

/**
 * The state of a virtual scene.
 *
 * @param json the JSON representation of the scene, or null to create
 * an empty scene.
 */
export class Scene extends Resource {
  _idTree: IdTreeNode;
  _entityHierarchy: EntityHierarchyNode;

  /** Returns a reference to the entity hierarchy root node. */
  get entityHierarchy(): EntityHierarchyNode {
    return this._entityHierarchy;
  }

  constructor(jsonOrIdTree: Object, entityHierarchy?: EntityHierarchyNode) {
    super();
    if (jsonOrIdTree instanceof IdTreeNode) {
      this._idTree = jsonOrIdTree;
      if (!entityHierarchy) {
        throw new Error('Missing entity hierarchy.');
      }
      this._entityHierarchy = entityHierarchy;
      return;
    }
    this._idTree = new IdTreeLeafNode();
    this._entityHierarchy = new EntityHierarchyNode();
    const storedEntities = jsonOrIdTree.entities;
    storedEntities && this._createEntities(storedEntities);
    // create the initial entities that don't yet exist
    this._createEntities(this._getInitialEntities(), storedEntities);
  }

  reduce(action: ResourceAction): ?Resource {
    const handler = SceneActions[action.type];
    return handler ? handler.reduce(this, action) : this;
  }

  reduceUndoStack(
    undoStack: ResourceAction[],
    action: ResourceAction,
  ): ResourceAction[] {
    const handler = SceneActions[action.type];
    return handler && handler.reduceUndoStack
      ? handler.reduceUndoStack(this, undoStack, action)
      : undoStack;
  }

  toJSON(): Object {
    const entities = {};
    this._idTree.applyToEntities(entity => {
      entities[entity.id] = entity.toJSON();
    });
    return {entities};
  }

  getEntity(id: string): ?Entity {
    return this._idTree.getEntity(id);
  }

  addEntity(entity: Entity): Resource {
    const newIdTree = this._idTree.addEntity(entity);
    return new this.constructor(
      newIdTree,
      this._entityHierarchy.addEntity(newIdTree.getEntityLineage(entity)),
    );
  }

  removeEntity(id: string): Resource {
    const [newIdTree, entity] = this._idTree.removeEntity(id);
    if (!entity) {
      return this;
    }
    return new this.constructor(
      newIdTree,
      this._entityHierarchy.removeEntity(newIdTree.getEntityLineage(entity)),
    );
  }

  /**
   * Given an edit represented by the specified map, returns the reverse edit.
   *
   * @param map the map containing the edit.
   * @return the reversed edit.
   */
  createReverseEdit(map: Object): Object {
    const reversed = {};
    for (const id in map) {
      const entity = this.getEntity(id);
      const state = map[id];
      if (state === null) {
        entity && (reversed[id] = entity.state);
      } else if (entity) {
        reversed[id] = reverseEdit(entity.state, state);
      } else {
        reversed[id] = null;
      }
    }
    return reversed;
  }

  /**
   * Applies an edit represented by a map.
   *
   * @param map the edit to apply.
   * @return the new, edited scene.
   */
  applyEdit(map: Object): Scene {
    // first apply to the id tree, remembering added and removed entities
    let newIdTree = this._idTree;
    const removedEntities: Entity[] = [];
    const addedEntities: Entity[] = [];
    for (const id in map) {
      const state = map[id];
      let oldEntity: ?Entity;
      if (state === null) {
        [newIdTree, oldEntity] = newIdTree.removeEntity(id);
      } else {
        let newEntity: Entity;
        [newIdTree, oldEntity, newEntity] = newIdTree.editEntity(id, state);
        addedEntities.push(newEntity);
      }
      oldEntity && removedEntities.push(oldEntity);
    }

    // process hierarchy removals with old id tree
    let newEntityHierarchy = this._entityHierarchy;
    for (const entity of removedEntities) {
      newEntityHierarchy = newEntityHierarchy.removeEntity(
        this._idTree.getEntityLineage(entity),
      );
    }

    // then the additions with the new one
    for (const entity of addedEntities) {
      newEntityHierarchy = newEntityHierarchy.addEntity(
        newIdTree.getEntityLineage(entity),
      );
    }
    return new this.constructor(newIdTree, newEntityHierarchy);
  }

  _createEntities(states: Object, except: Object = {}) {
    // first add all the entities to the id tree
    const createdEntities: Entity[] = [];
    for (const id in states) {
      if (except[id]) {
        continue;
      }
      const entity = new Entity(id, states[id]);
      createdEntities.push(entity);
      this._idTree = this._idTree.addEntity(entity);
    }
    // then to the hierarchy, now that we can look everything up by id
    for (const entity of createdEntities) {
      this._entityHierarchy = this._entityHierarchy.addEntity(
        this._idTree.getEntityLineage(entity),
      );
    }
  }

  _getInitialEntities(): Object {
    return {};
  }
}

/**
 * A scene representing a virtual environment.
 */
class Environment extends Scene {
  getType(): ResourceType {
    return 'environment';
  }
  _getInitialEntities(): Object {
    return {default: {}};
  }
}

/**
 * A scene representing a virtual organism.
 */
class Organism extends Scene {
  getType(): ResourceType {
    return 'organism';
  }
  _getInitialEntities(): Object {
    return {exterior: {}, interior: {order: 1}};
  }
}

// register the type constructors for deserialization
addResourceTypeConstructor('environment', Environment);
addResourceTypeConstructor('organism', Organism);

// used to determine which edits to merge
let editNumber = 0;

/**
 * Advances the current edit number, ensuring that future edits will not be
 * merged with previous ones.
 */
export function advanceEditNumber() {
  editNumber++;
}

/**
 * Recursively generates a reverse edit for the supplied state/edit.
 *
 * @param state the original state.
 * @param edit the edit to reverse.
 * @return the reversed edit.
 */
function reverseEdit(state: Object, edit: Object): Object {
  const reversed = {};
  for (const key in edit) {
    const oldValue = state[key];
    const newValue = edit[key];
    if (oldValue === undefined || oldValue === null) {
      reversed[key] = null;
    } else {
      reversed[key] =
        typeof oldValue === 'object' &&
        typeof newValue === 'object' &&
        newValue !== null
          ? reverseEdit(oldValue, newValue)
          : oldValue;
    }
  }
  return reversed;
}

/**
 * Merges two entity edits into one.
 *
 * @param first the first edit to merge.
 * @param second the second edit to merge.
 * @return the merged edit.
 */
function mergeEntityEdits(first: Object, second: Object): Object {
  const merged = {};
  for (const key in first) {
    const firstValue = first[key];
    const secondValue = second[key];
    if (secondValue === undefined) {
      // not in second; use value from first
      merged[key] = firstValue;
    } else if (secondValue === null) {
      // deleted in second; delete if also deleted in first
      firstValue === null && (merged[key] = null);
    } else if (
      typeof firstValue === 'object' &&
      firstValue !== null &&
      typeof secondValue === 'object'
    ) {
      // values are mergeable; merge recursively
      merged[key] = mergeEntityEdits(firstValue, secondValue);
    } else {
      // values not mergeable; use second value
      merged[key] = secondValue;
    }
  }
  // add anything from the second that wasn't in the first
  for (const key in second) {
    if (first[key] === undefined) {
      merged[key] = second[key];
    }
  }
  return merged;
}

/**
 * The actions that apply to scenes.
 */
export const SceneActions = {
  editEntities: {
    create: (map: Object) => ({type: 'editEntities', editNumber, map}),
    reduce: (state: Scene, action: ResourceAction) => {
      return state.applyEdit(action.map);
    },
    reduceUndoStack: (
      state: Scene,
      undoStack: ResourceAction[],
      action: ResourceAction,
    ) => {
      const reverseEdit = state.createReverseEdit(action.map);
      const undoIndex = undoStack.length - 1;
      if (undoIndex >= 0) {
        const lastUndo = undoStack[undoIndex];
        if (
          lastUndo.type === 'editEntities' &&
          lastUndo.editNumber === action.editNumber
        ) {
          // merge into existing edit
          return (undoStack
            .slice(0, undoIndex)
            .concat([
              mergeEntityEdits(lastUndo.map, reverseEdit),
            ]): ResourceAction[]);
        }
      }
      return (undoStack.concat([
        SceneActions.editEntities.create(reverseEdit),
      ]): ResourceAction[]);
    },
  },
};
