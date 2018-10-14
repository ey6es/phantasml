/**
 * Resource state model.
 *
 * @module server/store/resource
 * @flow
 */

import {simplifyTransform} from './math';
import type {ResourceType} from '../api';

export type ResourceAction = {type: string, [string]: any};

/**
 * Applies actions to the resource, returning a new resource.
 *
 * @param state the existing resource state.
 * @param action the action to apply.
 * @return the new resource instance.
 */
export function reducer(state: ?Resource, action: ResourceAction): ?Resource {
  // first check the list of actions that apply to all resources
  const handler = ResourceActions[action.type];
  if (handler) {
    return handler.reduce(state, action);
  }
  // then try state-specific actions
  if (state) {
    return state.reduce(action);
  }
  // finally, return null rather than undefined to initialize
  return null;
}

/**
 * Takes an undo stack and an action, returns the new undo stack.
 *
 * @param state the existing resource state.
 * @param undoStack the current undo stack.
 * @param action the action to apply.
 * @return the new undo stack.
 */
export function undoStackReducer(
  state: ?Resource,
  undoStack: ResourceAction[],
  action: ResourceAction,
): ResourceAction[] {
  // undo actions are always state-specific
  return state ? state.reduceUndoStack(undoStack, action) : undoStack;
}

/**
 * Base class for all resources.
 */
export class Resource {
  /**
   * Returns the type of the resource.
   *
   * @return the resource type.
   */
  getType(): ResourceType {
    throw new Error('Not implemented.');
  }

  /**
   * Applies the specified action to this resource, returning a new resource.
   *
   * @param action the action to apply.
   * @return the new resource instance.
   */
  reduce(action: ResourceAction): ?Resource {
    return this;
  }

  /**
   * Applies the specified action to the undo stack, returning the new stack.
   *
   * @param undoStack the original undo stack.
   * @param action the action to apply.
   * @return the new undo stack.
   */
  reduceUndoStack(
    undoStack: ResourceAction[],
    action: ResourceAction,
  ): ResourceAction[] {
    return undoStack;
  }

  /**
   * Serializes the resource to JSON.
   *
   * @return the JSON representation.
   */
  toJSON(): Object {
    return {};
  }

  /**
   * Retrieves an entity reference from the resource.
   *
   * @param id the id of the entity to fetch.
   * @return the entity reference, if found.
   */
  getEntity(id: string): ?Entity {
    return null;
  }

  /**
   * Adds an entity to the resource.
   *
   * @param entity the entity to add.
   * @return the modified resource.
   */
  addEntity(entity: Entity): Resource {
    return this;
  }

  /**
   * Removes an entity from the resource.
   *
   * @param id the id of the entity to remove.
   * @return the modified resource.
   */
  removeEntity(id: string): Resource {
    return this;
  }
}

export type EntityReference = {ref: string};

/**
 * Base class for all entities.
 *
 * @param id the entity's unique identifier.
 * @param json the entity's JSON state.
 */
export class Entity {
  id: string;
  state: Object;
  visit = 0;

  _cachedValues: ?Map<string, mixed>;

  _derivedValues: ?Map<string, mixed>;
  _derivedLineage: ?(Entity[]);

  constructor(id: string, state: Object = {}) {
    this.id = id;
    this.state = state;
  }

  /**
   * Returns the entity's parent reference, if any.
   *
   * @return the parent reference, if parented.
   */
  getParent(): ?EntityReference {
    return this.state.parent;
  }

  /**
   * Retrieves the entity's sort order.
   *
   * @return the sort order (zero by default).
   */
  getOrder(): number {
    return this.state.order || 0;
  }

  /**
   * Retrieves the entity's name, if any.
   *
   * @return the entity name, if named.
   */
  getName(): ?string {
    return this.state.name;
  }

  /**
   * Gets a value derived from the entity (only) through the cache.
   *
   * @param name the name of the desired value.
   * @param fn the function to compute the desired value from the entity.
   */
  getCachedValue<T>(name: string, fn: Entity => T): T {
    let cachedValues = this._cachedValues;
    if (cachedValues) {
      const value = cachedValues.get(name);
      if (value !== undefined) {
        return (value: any);
      }
    } else {
      cachedValues = this._cachedValues = new Map();
    }
    const value = fn(this);
    cachedValues.set(name, value);
    return value;
  }

  /**
   * Gets a value derived from the entity's lineage through the cache.
   *
   * @param lineage the entity's current lineage.
   * @param name the name of the desired value.
   * @param fn the function to compute the desired value from the lineage.
   */
  getDerivedValue<T>(lineage: Entity[], name: string, fn: (Entity[]) => T): T {
    // clear the cache if the lineage has changed
    const currentLineage = this._derivedLineage;
    if (currentLineage && !lineagesEqual(currentLineage, lineage)) {
      this._derivedValues = null;
      this._derivedLineage = lineage;
    }
    let derivedValues = this._derivedValues;
    if (derivedValues) {
      const value = derivedValues.get(name);
      if (value !== undefined) {
        return (value: any);
      }
    } else {
      derivedValues = this._derivedValues = new Map();
    }
    const value = fn(lineage);
    derivedValues.set(name, value);
    return value;
  }

  /**
   * Serializes the entity to JSON.
   *
   * @return the JSON representation.
   */
  toJSON(): Object {
    // special handling for transforms; simplify to remove redundant data
    if (this.state.transform !== undefined) {
      const simplified = simplifyTransform(this.state.transform, true);
      if (simplified) {
        this.state.transform = simplified;
      } else {
        delete this.state.transform;
      }
    }
    return this.state;
  }
}

function lineagesEqual(first: Entity[], second: Entity[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  for (let ii = 0; ii < first.length; ii++) {
    if (first[ii] !== second[ii]) {
      return false;
    }
  }
  return true;
}

// the map from resource type to constructor
const resourceTypeConstructors: {[ResourceType]: Function} = {};

/**
 * Adds a constructor for a resource type.
 *
 * @param type the type of resource to construct.
 * @param constructor the constructor function.
 */
export function addResourceTypeConstructor(
  type: ResourceType,
  constructor: Function,
) {
  resourceTypeConstructors[type] = constructor;
}

/**
 * The map containing all the resource actions.
 */
export const ResourceActions = {
  setResource: {
    create: (resourceType: ResourceType, json: Object) => ({
      type: 'setResource',
      resourceType,
      json,
    }),
    reduce: (state: ?Resource, action: ResourceAction) => {
      const Constructor = resourceTypeConstructors[action.resourceType];
      if (!Constructor) {
        throw new Error('Unknown resource type: ' + action.resourceType);
      }
      return new Constructor(action.json);
    },
  },
  clearResource: {
    create: () => ({type: 'clearResource'}),
    reduce: (state: ?Resource, action: ResourceAction) => null,
  },
};
