/**
 * Environment state model.
 *
 * @module server/store/environment
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
  editEntity(id: string, state: Object, depth: number = 0): IdTreeNode {
    throw new Error('Not implemented.');
  }
  addEntity(entity: Entity, depth: number = 0): IdTreeNode {
    throw new Error('Not implemented.');
  }
  removeEntity(id: string, depth: number = 0): IdTreeNode {
    throw new Error('Not implemented');
  }
  applyToEntities(op: Entity => void) {
    throw new Error('Not implemented.');
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
  editEntity(id: string, state: Object, depth: number = 0): IdTreeNode {
    const entity = this._entities.get(id);
    if (!entity) {
      return this.addEntity(new Entity(id, state), depth);
    }
    const newEntities = new Map(this._entities);
    newEntities.set(id, new Entity(id, mergeEntityEdits(entity.state, state)));
    return new IdTreeLeafNode(newEntities);
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
  removeEntity(id: string, depth: number = 0): IdTreeNode {
    const newEntities = new Map(this._entities);
    newEntities.delete(id);
    return new IdTreeLeafNode(newEntities);
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
  editEntity(id: string, state: Object, depth: number = 0): IdTreeNode {
    if (isIdEven(id, depth)) {
      return new IdTreeInternalNode(
        this._even.editEntity(id, state, depth + 1),
        this._odd,
      );
    } else {
      return new IdTreeInternalNode(
        this._even,
        this._odd.editEntity(id, state, depth + 1),
      );
    }
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
  removeEntity(id: string, depth: number = 0): IdTreeNode {
    let even = this._even;
    let odd = this._odd;
    if (isIdEven(id, depth)) {
      even = even.removeEntity(id, depth + 1);
    } else {
      odd = odd.removeEntity(id, depth + 1);
    }
    // collapse into leaf if children are small enough
    if (
      even instanceof IdTreeLeafNode &&
      odd instanceof IdTreeLeafNode &&
      even._entities.size + odd._entities.size < LEAF_COLLAPSE_SIZE
    ) {
      return new IdTreeLeafNode(new Map([...even._entities, ...odd._entities]));
    }
    return new IdTreeInternalNode(even, odd);
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
 * The state of a virtual environment.
 *
 * @param json the JSON representation of the environment, or null to create
 * an empty environment.
 */
export class Environment extends Resource {
  _idTree: IdTreeNode;

  constructor(jsonOrIdTree: Object) {
    super();
    if (jsonOrIdTree instanceof IdTreeNode) {
      this._idTree = jsonOrIdTree;
    } else {
      this._idTree = new IdTreeLeafNode();
      const entities = jsonOrIdTree.entities;
      if (entities) {
        for (const id in entities) {
          const state = entities[id];
          this._idTree = this._idTree.addEntity(new Entity(id, state));
        }
      }
    }
  }

  getType(): ResourceType {
    return 'environment';
  }

  reduce(action: ResourceAction): ?Resource {
    const handler = EnvironmentActions[action.type];
    return handler ? handler.reduce(this, action) : this;
  }

  reduceUndoStack(
    undoStack: ResourceAction[],
    action: ResourceAction,
  ): ResourceAction[] {
    const handler = EnvironmentActions[action.type];
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
    return new Environment(this._idTree.addEntity(entity));
  }

  removeEntity(id: string): Resource {
    return new Environment(this._idTree.removeEntity(id));
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
   * @return the new, edited environment.
   */
  applyEdit(map: Object): Environment {
    let idTree = this._idTree;
    for (const id in map) {
      const state = map[id];
      if (state === null) {
        idTree = idTree.removeEntity(id);
      } else {
        idTree = idTree.editEntity(id, state);
      }
    }
    return new Environment(idTree);
  }
}

// register the type constructor for deserialization
addResourceTypeConstructor('environment', Environment);

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
 * The actions that apply to environments.
 */
export const EnvironmentActions = {
  editEntities: {
    create: (map: Object) => ({type: 'editEntities', editNumber, map}),
    reduce: (state: Environment, action: ResourceAction) => {
      return state.applyEdit(action.map);
    },
    reduceUndoStack: (
      state: Environment,
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
        EnvironmentActions.editEntities.create(reverseEdit),
      ]): ResourceAction[]);
    },
  },
};
