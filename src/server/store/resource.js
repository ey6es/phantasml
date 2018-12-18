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
 * Base class for reference-counted objects.
 */
export class RefCounted {
  _refCount = 0;

  /**
   * Increments the object's reference count.  When the reference count reaches
   * one, the object is initialized.
   */
  ref() {
    if (++this._refCount === 1) {
      this._init();
    }
  }

  /**
   * Decrements the object's reference count.  When the reference count reaches
   * zero, the object is disposed.
   */
  deref() {
    if (--this._refCount === 0) {
      this._dispose();
    }
  }

  _init() {
    // nothing by default
  }

  _dispose() {
    // nothing by default
  }
}

/**
 * Base class for all resources.
 */
export class Resource extends RefCounted {
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
 * Wraps a cached value that may be transferred to a new version of an entity.
 *
 * @param value the value to wrap.
 * @param canTransfer the function that determines whether the value is
 * transferable (and whether we have enough information to determine that).
 */
export class TransferableValue<T> extends RefCounted {
  value: T;
  canTransfer: Entity => ?boolean;

  constructor(value: T, canTransfer: Entity => ?boolean) {
    super();
    this.value = value;
    this.canTransfer = canTransfer;
  }

  _init() {
    if (this.value instanceof RefCounted) {
      this.value.ref();
    }
  }

  _dispose() {
    if (this.value instanceof RefCounted) {
      this.value.deref();
    }
    delete this.value;
  }
}

class ConditionallyTransferableValue extends RefCounted {
  value: TransferableValue<mixed>;

  constructor(value: TransferableValue<mixed>) {
    super();
    this.value = value;
  }

  _init() {
    this.value && this.value.ref();
  }

  _dispose() {
    this.value && this.value.deref();
    delete this.value;
  }
}

/**
 * Base class for all entities.
 *
 * @param id the entity's unique identifier.
 * @param state the entity's state.
 * @param [previousEntity] the previous entity from which to transfer cached
 * values, if any.
 */
export class Entity extends RefCounted {
  id: string;
  state: Object;
  visit = 0;

  _cachedValues: ?Map<mixed, mixed>;

  constructor(id: string, state: Object = {}, previousEntity?: Entity) {
    super();
    this.id = id;
    this.state = state;
    if (previousEntity && previousEntity._cachedValues) {
      // transfer any transferable values
      for (const [key, value] of previousEntity._cachedValues) {
        if (value instanceof TransferableValue) {
          const canTransfer = value.canTransfer(this);
          if (canTransfer !== false) {
            if (!this._cachedValues) {
              this._cachedValues = new Map();
            }
            if (canTransfer === true) {
              this._cachedValues.set(key, value);
            } else {
              // canTransfer == null
              const condValue = new ConditionallyTransferableValue(value);
              this._cachedValues.set(key, condValue);
            }
          }
        } else if (
          value instanceof ConditionallyTransferableValue &&
          value.value.canTransfer(this) !== false
        ) {
          if (!this._cachedValues) {
            this._cachedValues = new Map();
          }
          this._cachedValues.set(key, value);
        }
      }
    }
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
   * Returns the most recently cached value under the specified key, if any.
   *
   * @param key the key of the desired value.
   * @return the cached value, if present.
   */
  getLastCachedValue<K, V>(key: K): ?V {
    if (!this._cachedValues) {
      return;
    }
    const value = this._cachedValues.get(key);
    if (value instanceof TransferableValue) {
      return (value.value: any);
    }
    if (value instanceof ConditionallyTransferableValue) {
      return;
    }
    return (value: any);
  }

  /**
   * Gets a value derived from the entity (only) through the cache.
   *
   * @param key the key of the desired value.
   * @param fn the function to compute the desired value.  Any additional
   * arguments will be passed to this function.
   * @return the cached value.
   */
  getCachedValue<K, V>(
    key: K,
    fn: (...any[]) => V | TransferableValue<V>,
    ...args: any[]
  ): V {
    let cachedValues = this._cachedValues;
    if (cachedValues) {
      const value = cachedValues.get(key);
      if (value !== undefined) {
        if (value instanceof TransferableValue) {
          return (value.value: any);
        }
        if (value instanceof ConditionallyTransferableValue) {
          const transferableValue = value.value;
          const canTransfer = transferableValue.canTransfer(this);
          if (canTransfer === true) {
            // promote to fully transferable
            cachedValues.set(key, transferableValue);
            if (this._refCount > 0) {
              transferableValue.ref();
              value.deref();
            }
            return (transferableValue.value: any);
          } else if (this._refCount > 0) {
            // fall through to normal handling
            value.deref();
          }
        } else {
          return (value: any);
        }
      }
    } else {
      cachedValues = this._cachedValues = new Map();
    }
    const value = fn(...args);
    // don't store undefined, else we can't tell whether a value is stored
    cachedValues.set(key, value === undefined ? null : value);
    if (this._refCount > 0 && value instanceof RefCounted) {
      value.ref();
    }
    return value instanceof TransferableValue ? value.value : value;
  }

  /**
   * Serializes the entity to JSON.
   *
   * @return the JSON representation.
   */
  toJSON(): Object {
    // special handling for transforms; simplify to remove redundant data
    if (this.state.transform !== undefined) {
      simplifyTransform(this.state.transform, true);
    }
    return this.state;
  }

  _init() {
    const cachedValues = this._cachedValues;
    if (cachedValues) {
      for (const value of cachedValues.values()) {
        if (value instanceof RefCounted) {
          value.ref();
        }
      }
    }
  }

  _dispose() {
    const cachedValues = this._cachedValues;
    if (cachedValues) {
      for (const value of cachedValues.values()) {
        if (value instanceof RefCounted) {
          value.deref();
        }
      }
      this._cachedValues = null;
    }
  }
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
