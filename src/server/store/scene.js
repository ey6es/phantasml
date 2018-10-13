/**
 * Scene state model.
 *
 * @module server/store/scene
 * @flow
 */

import {Resource, Entity, addResourceTypeConstructor} from './resource';
import type {ResourceAction} from './resource';
import type {Transform, Bounds} from './math';
import {composeTransforms, emptyBounds, transformBoundsEquals} from './math';
import {Geometry} from './geometry';
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
export class EntityHierarchyNode {
  _entity: ?Entity;
  _children: EntityHierarchyNode[];

  /** Returns a reference to the entity, if any. */
  get entity(): ?Entity {
    return this._entity;
  }

  /** Returns the entity's id, if there's an entity. */
  get id(): ?string {
    return this._entity && this._entity.id;
  }

  /** Returns the entity's name, if there's an entity. */
  get name(): ?string {
    return this._entity && this._entity.getName();
  }

  /** Returns the entity's order, or zero if none. */
  get order(): number {
    return this._entity ? this._entity.getOrder() : 0;
  }

  /** Returns a reference to the child array. */
  get children(): EntityHierarchyNode[] {
    return this._children;
  }

  /** Returns the lowest order of all the child entities (or zero if none). */
  get lowestChildOrder(): number {
    const firstChild = this._children[0];
    return firstChild ? firstChild.order : 0;
  }

  /** Returns the highest order of all the child entities (or zero if none). */
  get highestChildOrder(): number {
    const lastChild = this._children[this._children.length - 1];
    return lastChild ? lastChild.order : 0;
  }

  constructor(entity: ?Entity = null, children: EntityHierarchyNode[] = []) {
    this._entity = entity;
    this._children = children;
  }

  getNode(lineage: Entity[], depth: number = 0): ?EntityHierarchyNode {
    if (depth >= lineage.length) {
      return; // invalid lineage
    }
    const entity = lineage[depth];
    const node = this.getChild(entity.id);
    const nextDepth = depth + 1;
    if (!node || nextDepth >= lineage.length) {
      return node;
    }
    return node.getNode(lineage, nextDepth);
  }

  addEntity(lineage: Entity[], depth: number = 0): EntityHierarchyNode {
    if (depth >= lineage.length) {
      return this; // invalid lineage
    }
    const entity = lineage[depth];
    let newChildren: EntityHierarchyNode[] = [];
    const nextDepth = depth + 1;
    let foundEntity = false;
    const entityOrder = entity.getOrder();
    for (let child of this._children) {
      if (!foundEntity) {
        if (child._entity === entity) {
          foundEntity = true;
          if (nextDepth < lineage.length) {
            child = child.addEntity(lineage, nextDepth);
          }
        } else if (entityOrder < child.order) {
          foundEntity = true;
          let newChild = new EntityHierarchyNode(entity);
          if (nextDepth < lineage.length) {
            newChild = newChild.addEntity(lineage, nextDepth);
          }
          newChildren.push(newChild);
        }
      }
      newChildren.push(child);
    }
    if (!foundEntity) {
      let newChild = new EntityHierarchyNode(entity);
      if (nextDepth < lineage.length) {
        newChild = newChild.addEntity(lineage, nextDepth);
      }
      newChildren.push(newChild);
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

  /**
   * Retrieves the child node with the specified id.
   *
   * @param id the id of the child of interest.
   * @return the corresponding child node, if found.
   */
  getChild(id: string): ?EntityHierarchyNode {
    for (const child of this._children) {
      if (child.id === id) {
        return child;
      }
    }
  }

  /**
   * Retrieves the index of the child with the specified id.
   *
   * @param id the id of the child of interest.
   * @return the child index, or -1 if not found.
   */
  getChildIndex(id: string): number {
    for (let ii = 0; ii < this._children.length; ii++) {
      if (this._children[ii].id === id) {
        return ii;
      }
    }
    return -1;
  }

  /**
   * Checks whether changing the order of the identified entity will move it in
   * the child array.
   *
   * @param id the id of the entity.
   * @param newOrder the new entity order.
   * @return whether or not changing the order will reorder the children.
   */
  entityWillMove(id: string, newOrder: number): boolean {
    let previousId: ?string;
    for (const child of this._children) {
      if (newOrder < child.order) {
        return id !== child.id && id !== previousId;
      }
      previousId = child.id;
    }
    return id !== previousId;
  }

  /**
   * Finds a name that no child of this node has.
   *
   * @param baseName the name base (that is, without the number).
   * @param [firstNumber] if specified, the first number to try.
   * @return the locally unique name.
   */
  getUniqueName(baseName: string, firstNumber?: number): string {
    // search children for the highest current number
    let highestNumber = 0;
    for (const child of this._children) {
      const name = child.name;
      if (name && name.startsWith(baseName)) {
        const number = parseInt(name.substring(baseName.length + 1));
        highestNumber = Math.max(highestNumber, isNaN(number) ? 1 : number);
      }
    }
    if (highestNumber) {
      return `${baseName} ${highestNumber + 1}`;
    }
    return firstNumber ? `${baseName} ${firstNumber}` : baseName;
  }

  /**
   * Applies an operation to the entities in the hierarchy in depth-first
   * order.
   *
   * @param op the operation to apply, which should return true/undefined to
   * continue traversing or false to stop.
   * @return true to continue applying, false to stop.
   */
  applyToEntities(op: Entity => ?boolean): boolean {
    if (this._entity && op(this._entity) === false) {
      return false;
    }
    for (const child of this._children) {
      if (!child.applyToEntities(op)) {
        return false;
      }
    }
    return true;
  }
}

/**
 * A node in the bounding region quadtree.
 */
class QuadtreeNode {
  _entities: Entity[] = [];
  _children: QuadtreeNode[] = [];

  addEntity(entity: Entity, bounds: Bounds): QuadtreeNode {
    return this;
  }

  removeEntity(entity: Entity, bounds: Bounds): QuadtreeNode {
    return this;
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
  _quadtree: QuadtreeNode;

  /** Returns a reference to the entity hierarchy root node. */
  get entityHierarchy(): EntityHierarchyNode {
    return this._entityHierarchy;
  }

  constructor(
    jsonOrIdTree: Object,
    entityHierarchy?: EntityHierarchyNode,
    quadtree?: QuadtreeNode,
  ) {
    super();
    if (jsonOrIdTree instanceof IdTreeNode) {
      this._idTree = jsonOrIdTree;
      if (!entityHierarchy) {
        throw new Error('Missing entity hierarchy.');
      }
      this._entityHierarchy = entityHierarchy;
      if (!quadtree) {
        throw new Error('Missing quadtree.');
      }
      this._quadtree = quadtree;
      return;
    }
    this._idTree = new IdTreeLeafNode();
    this._entityHierarchy = new EntityHierarchyNode();
    this._quadtree = new QuadtreeNode();
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
    const lineage = newIdTree.getEntityLineage(entity);
    return new this.constructor(
      newIdTree,
      this._entityHierarchy.addEntity(lineage),
      this._quadtree.addEntity(entity, this._getWorldBounds(lineage)),
    );
  }

  /**
   * Given an entity id, returns its world transform.
   *
   * @param id the id of the entity of interest.
   * @return the entity's world transform.
   */
  getWorldTransform(id: string): Transform {
    return this._getWorldTransform(this.getEntityLineage(this.getEntity(id)));
  }

  _getWorldTransform(lineage: Entity[]): Transform {
    const lastIndex = lineage.length - 1;
    if (lastIndex < 0) {
      return null;
    }
    return lineage[lastIndex].getDerivedValue(
      lineage,
      'worldTransform',
      this._computeWorldTransform,
    );
  }

  _computeWorldTransform = (lineage: Entity[]) => {
    const lastIndex = lineage.length - 1;
    const lastEntity = lineage[lastIndex];
    const localTransform = lastEntity.state.transform;
    if (lastIndex === 0) {
      return localTransform;
    }
    return composeTransforms(
      lineage[lastIndex - 1].getDerivedValue(
        lineage.slice(0, lastIndex),
        'worldTransform',
        this._computeWorldTransform,
      ),
      localTransform,
    );
  };

  _getWorldBounds(lineage: Entity[]): Bounds {
    return lineage[lineage.length - 1].getDerivedValue(
      lineage,
      'worldBounds',
      this._computeWorldBounds,
    );
  }

  _computeWorldBounds = (lineage: Entity[]) => {
    const lastEntity = lineage[lineage.length - 1];
    const bounds = emptyBounds();
    for (const key in lastEntity.state) {
      const data = Geometry[key];
      data && data.addToBounds(bounds, lastEntity.state[key]);
    }
    return transformBoundsEquals(bounds, this._getWorldTransform(lineage));
  };

  /**
   * Given an entity id, checks whether the ids of any of its ancestors (but
   * not the entity itself) are in the provided set.
   *
   * @param id the id of the entity of interest.
   * @param set the set of ids to check.
   * @return whether or not any of the ancestors' ids are in the set.
   */
  isAncestorInSet(id: string, set: Set<string>): boolean {
    const entity = this.getEntity(id);
    if (!entity) {
      return false;
    }
    const lineage = this.getEntityLineage(entity);
    for (let ii = lineage.length - 2; ii >= 0; ii--) {
      if (set.has(lineage[ii].id)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets the full lineage of an entity.
   *
   * @param entity the entity whose lineage is desired.
   * @return the entities in the lineage.
   */
  getEntityLineage(entity: ?Entity): Entity[] {
    return this._idTree.getEntityLineage(entity);
  }

  /**
   * Retrieves a node in the entity hierarchy by its id.
   *
   * @param id the id of the node of interest.
   * @return the node, if found.
   */
  getEntityHierarchyNode(id: string): ?EntityHierarchyNode {
    return this._entityHierarchy.getNode(
      this._idTree.getEntityLineage(this.getEntity(id)),
    );
  }

  /**
   * Checks whether the identified entity is one of the built-in initial ones
   * that can't be removed or renamed.
   *
   * @param id the id to check.
   * @return whether or not the id corresponds to an initial entity.
   */
  isInitialEntity(id: string): boolean {
    return !!this._getInitialEntities()[id];
  }

  /**
   * Returns the number of initial pages.
   *
   * @return the initial page count.
   */
  getInitialPageCount(): number {
    const initialEntities = this._getInitialEntities();
    let count = 0;
    for (const key in initialEntities) {
      if (!initialEntities[key].parent) {
        count++;
      }
    }
    return count;
  }

  removeEntity(id: string): Resource {
    const [newIdTree, entity] = this._idTree.removeEntity(id);
    if (!entity) {
      return this;
    }
    const lineage = newIdTree.getEntityLineage(entity);
    return new this.constructor(
      newIdTree,
      this._entityHierarchy.removeEntity(lineage),
      this._quadtree.removeEntity(entity, this._getWorldBounds(lineage)),
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
        // store the state of the entity and all descendants
        const node = this._entityHierarchy.getNode(
          this._idTree.getEntityLineage(entity),
        );
        node &&
          node.applyToEntities(entity => {
            reversed[entity.id] = entity.state;
          });
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
        // remove entity and all descendants
        const node = this._entityHierarchy.getNode(
          this._idTree.getEntityLineage(this._idTree.getEntity(id)),
        );
        node &&
          node.applyToEntities(entity => {
            [newIdTree, oldEntity] = newIdTree.removeEntity(entity.id);
            oldEntity && removedEntities.push(oldEntity);
          });
      } else {
        let newEntity: Entity;
        [newIdTree, oldEntity, newEntity] = newIdTree.editEntity(id, state);
        addedEntities.push(newEntity);
        if (oldEntity) {
          removedEntities.push(oldEntity);
          // if the parent changed, we need to readd descendants
          // (unless they are being removed/edited)
          const node = this._entityHierarchy.getNode(
            this._idTree.getEntityLineage(oldEntity),
          );
          node &&
            node.applyToEntities(entity => {
              if (map[entity.id] === undefined) {
                addedEntities.push(entity);
              }
            });
        }
      }
    }

    // process hierarchy removals with old id tree
    let newEntityHierarchy = this._entityHierarchy;
    let newQuadtree = this._quadtree;
    for (const entity of removedEntities) {
      const lineage = this._idTree.getEntityLineage(entity);
      newEntityHierarchy = newEntityHierarchy.removeEntity(lineage);
      newQuadtree = newQuadtree.removeEntity(
        entity,
        this._getWorldBounds(lineage),
      );
    }

    // then the additions with the new one
    for (const entity of addedEntities) {
      const lineage = newIdTree.getEntityLineage(entity);
      newEntityHierarchy = newEntityHierarchy.addEntity(lineage);
      newQuadtree = newQuadtree.addEntity(
        entity,
        this._getWorldBounds(lineage),
      );
    }
    return new this.constructor(newIdTree, newEntityHierarchy, newQuadtree);
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
      const lineage = this._idTree.getEntityLineage(entity);
      if (lineage.length === 0) {
        const parent = entity.getParent();
        console.warn(
          `Invalid lineage: ${entity.id} ${String(entity.getName())} ` +
            String(parent && parent.ref),
        );
        const [newIdTree, oldEntity] = this._idTree.removeEntity(entity.id);
        this._idTree = newIdTree;
      } else {
        this._entityHierarchy = this._entityHierarchy.addEntity(lineage);
        this._quadtree = this._quadtree.addEntity(
          entity,
          this._getWorldBounds(lineage),
        );
      }
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
let currentEditNumber = 1;

/**
 * Advances the current edit number, ensuring that future edits will not be
 * merged with previous ones.
 */
export function advanceEditNumber() {
  currentEditNumber++;
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
    create: (map: Object, editNumber: number = currentEditNumber) => ({
      type: 'editEntities',
      editNumber,
      map,
    }),
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
          const map = mergeEntityEdits(reverseEdit, lastUndo.map);
          return (undoStack
            .slice(0, undoIndex)
            .concat([Object.assign({}, lastUndo, {map})]): ResourceAction[]);
        }
      }
      return (undoStack.concat([
        SceneActions.editEntities.create(reverseEdit, action.editNumber),
      ]): ResourceAction[]);
    },
  },
};
