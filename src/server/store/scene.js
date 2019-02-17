/**
 * Scene state model.
 *
 * @module server/store/scene
 * @flow
 */

import {
  Resource,
  RefCounted,
  Entity,
  addResourceTypeConstructor,
} from './resource';
import type {ResourceAction} from './resource';
import type {Transform, Bounds} from './math';
import {
  vec2,
  equals,
  composeTransforms,
  emptyBounds,
  boundsValid,
  boundsContain,
  boundsIntersect,
  boundsUnion,
  boundsUnionEquals,
  transformBoundsEquals,
  expandBoundsEquals,
} from './math';
import {ComponentBounds} from './bounds';
import type {ResourceType} from '../api';

const LEAF_EXPAND_SIZE = 16;
const LEAF_COLLAPSE_SIZE = 8;

/**
 * Maps ids to entities in a tree structure, limiting the changed object size.
 */
export class IdTreeNode extends RefCounted {
  getEntity(id: string, depth: number = 0): ?Entity {
    throw new Error('Not implemented.');
  }
  editEntity(
    id: string,
    state: ?Object,
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
  _init() {
    for (const entity of this._entities.values()) {
      entity.ref();
    }
  }
  _dispose() {
    for (const entity of this._entities.values()) {
      entity.deref();
    }
  }
  getEntity(id: string, depth: number = 0): ?Entity {
    return this._entities.get(id);
  }
  editEntity(
    id: string,
    state: ?Object,
    depth: number = 0,
  ): [IdTreeNode, ?Entity, Entity] {
    const oldEntity = this._entities.get(id);
    if (!oldEntity) {
      const newEntity = new Entity(id, state || {});
      return [this.addEntity(newEntity, depth), null, newEntity];
    }
    const newEntities = new Map(this._entities);
    let newState = oldEntity.state;
    let editType: ?string;
    if (state) {
      newState = applyEdit(oldEntity.state, state);
      editType = state._type;
    }
    const newEntity = new Entity(id, newState, oldEntity, editType);
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
  _init() {
    this._even.ref();
    this._odd.ref();
  }
  _dispose() {
    this._even.deref();
    this._odd.deref();
  }
  getEntity(id: string, depth: number = 0): ?Entity {
    return (isIdEven(id, depth) ? this._even : this._odd).getEntity(
      id,
      depth + 1,
    );
  }
  editEntity(
    id: string,
    state: ?Object,
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
  _id: ?string;
  _name: ?string;
  _order: number;
  _children: EntityHierarchyNode[];

  /** Returns the entity's id, if there's an entity. */
  get id(): ?string {
    return this._id;
  }

  /** Returns the entity's name, if there's an entity. */
  get name(): ?string {
    return this._name;
  }

  /** Returns the entity's order, or zero if none. */
  get order(): number {
    return this._order;
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

  constructor(
    id: ?string = null,
    name: ?string = null,
    order: number = 0,
    children: EntityHierarchyNode[] = [],
  ) {
    this._id = id;
    this._name = name;
    this._order = order;
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
        if (child.id === entity.id) {
          foundEntity = true;
          if (nextDepth < lineage.length) {
            child = child.addEntity(lineage, nextDepth);
          }
        } else if (entityOrder < child.order) {
          foundEntity = true;
          let newChild = new EntityHierarchyNode(
            entity.id,
            entity.getName(),
            entityOrder,
          );
          if (nextDepth < lineage.length) {
            newChild = newChild.addEntity(lineage, nextDepth);
          }
          newChildren.push(newChild);
        }
      }
      newChildren.push(child);
    }
    if (!foundEntity) {
      let newChild = new EntityHierarchyNode(
        entity.id,
        entity.getName(),
        entityOrder,
      );
      if (nextDepth < lineage.length) {
        newChild = newChild.addEntity(lineage, nextDepth);
      }
      newChildren.push(newChild);
    }
    return new EntityHierarchyNode(
      this._id,
      this._name,
      this._order,
      newChildren,
    );
  }

  removeEntity(lineage: Entity[], depth: number = 0): EntityHierarchyNode {
    if (depth >= lineage.length) {
      return this; // invalid lineage
    }
    const entity = lineage[depth];
    const newChildren: EntityHierarchyNode[] = [];
    for (const child of this._children) {
      if (child.id === entity.id) {
        const nextDepth = depth + 1;
        if (nextDepth < lineage.length) {
          newChildren.push(child.removeEntity(lineage, nextDepth));
        }
      } else {
        newChildren.push(child);
      }
    }
    return new EntityHierarchyNode(
      this._id,
      this._name,
      this._order,
      newChildren,
    );
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
   * Applies an operation to the entity ids in the hierarchy in depth-first
   * order.
   *
   * @param op the operation to apply, which should return true/undefined to
   * traverse the children or false not to.
   */
  applyToEntityIds(op: string => ?boolean) {
    if (this._id != null && op(this._id) === false) {
      return;
    }
    for (const child of this._children) {
      child.applyToEntityIds(op);
    }
  }
}

const nodeBounds = {min: vec2(), max: vec2()};

/** The last visit identifier used for traversal. */
export let currentVisit = 0;

const MAX_DEPTH = 16;

/**
 * A node in the bounding region quadtree.
 *
 * @param halfSize the half-size of the node (for the root).
 */
class QuadtreeNode {
  _halfSize: ?number;
  _totalBounds: ?Bounds;
  _entityBounds: Map<Entity, Bounds> = new Map();
  _children: (?QuadtreeNode)[] = [];

  /** Returns the total bounds of the (root) node. */
  get totalBounds(): ?Bounds {
    return this._totalBounds;
  }

  constructor(halfSize?: ?number, totalBounds?: ?Bounds) {
    if (halfSize != null) {
      this._halfSize = halfSize;
      this._totalBounds = totalBounds || emptyBounds();
    }
  }

  /**
   * Adds an entity to this (root) node.
   *
   * @param entity the entity to add.
   * @param bounds the entity's world bounds.
   * @return the new node with the entity added.
   */
  addEntity(entity: Entity, bounds: Bounds): QuadtreeNode {
    if (!boundsValid(bounds)) {
      return this; // no need to add invalid bounds
    }
    // grow the node until we can fit the entire bounds
    let node = this;
    while (!node._containsBounds(bounds)) {
      node = node._grow();
    }
    const halfSize: number = (node._halfSize: any);
    vec2(-halfSize, -halfSize, nodeBounds.min);
    vec2(halfSize, halfSize, nodeBounds.max);
    return node._addEntity(entity, bounds, node._getDepth(bounds));
  }

  _addEntity(entity: Entity, bounds: Bounds, depth: number): QuadtreeNode {
    const newNode = new QuadtreeNode(
      this._halfSize,
      this._totalBounds
        ? boundsContain(this._totalBounds, bounds)
          ? this._totalBounds
          : boundsUnion(this._totalBounds, bounds)
        : null,
    );
    newNode._entityBounds = this._entityBounds;
    newNode._children = this._children;
    if (depth === 0) {
      newNode._entityBounds = new Map(this._entityBounds);
      newNode._entityBounds.set(entity, bounds);
      return newNode;
    }
    newNode._children = this._children.slice();
    const minX = nodeBounds.min.x;
    const minY = nodeBounds.min.y;
    const halfSize = (nodeBounds.max.x - nodeBounds.min.x) * 0.5;
    for (let ii = 0; ii < 4; ii++) {
      vec2(minX, minY, nodeBounds.min);
      vec2(minX + halfSize, minY + halfSize, nodeBounds.max);
      if (ii & 1) {
        nodeBounds.min.x += halfSize;
        nodeBounds.max.x += halfSize;
      }
      if (ii & 2) {
        nodeBounds.min.y += halfSize;
        nodeBounds.max.y += halfSize;
      }
      if (boundsIntersect(nodeBounds, bounds)) {
        const child = this._children[ii] || new QuadtreeNode();
        newNode._children[ii] = child._addEntity(entity, bounds, depth - 1);
      }
    }
    return newNode;
  }

  /**
   * Removes an entity from this (root) node.
   *
   * @param entity the entity to remove.
   * @param bounds the entity's world bounds.
   * @return the new node with the entity removed.
   */
  removeEntity(entity: Entity, bounds: Bounds): QuadtreeNode {
    if (!boundsValid(bounds)) {
      return this;
    }
    const halfSize = this._halfSize;
    if (!halfSize) {
      throw new Error('Cannot remove entity on non-root.');
    }
    vec2(-halfSize, -halfSize, nodeBounds.min);
    vec2(halfSize, halfSize, nodeBounds.max);
    return this._removeEntity(entity, bounds, this._getDepth(bounds));
  }

  _removeEntity(entity: Entity, bounds: Bounds, depth: number): QuadtreeNode {
    const newNode = new QuadtreeNode(this._halfSize, this._totalBounds);
    newNode._entityBounds = this._entityBounds;
    newNode._children = this._children;
    if (depth === 0) {
      newNode._entityBounds = new Map(this._entityBounds);
      newNode._entityBounds.delete(entity);
      return newNode;
    }
    newNode._children = this._children.slice();
    const minX = nodeBounds.min.x;
    const minY = nodeBounds.min.y;
    const halfSize = (nodeBounds.max.x - nodeBounds.min.x) * 0.5;
    for (let ii = 0; ii < 4; ii++) {
      vec2(minX, minY, nodeBounds.min);
      vec2(minX + halfSize, minY + halfSize, nodeBounds.max);
      if (ii & 1) {
        nodeBounds.min.x += halfSize;
        nodeBounds.max.x += halfSize;
      }
      if (ii & 2) {
        nodeBounds.min.y += halfSize;
        nodeBounds.max.y += halfSize;
      }
      if (boundsIntersect(nodeBounds, bounds)) {
        const child = this._children[ii];
        if (child) {
          const newChild = child._removeEntity(entity, bounds, depth - 1);
          newNode._children[ii] = newChild.isEmpty() ? null : newChild;
        }
      }
    }
    return newNode;
  }

  /**
   * Checks whether the node is empty.
   *
   * @return whether or not the node is empty.
   */
  isEmpty(): boolean {
    if (this._entityBounds.size > 0) {
      return false;
    }
    for (let ii = 0; ii < 4; ii++) {
      if (this._children[ii]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Applies an operation to all entities intersecting the provided bounds.
   *
   * @param bounds the bounds to search.
   * @param op the operation to apply, which should return true/undefined to
   * continue traversing or false to stop.  Note that the operation should not
   * itself perform any bounds queries.
   */
  applyToEntities(bounds: Bounds, op: Entity => ?boolean) {
    const halfSize = this._halfSize;
    if (!halfSize) {
      throw new Error('Cannot apply on non-root.');
    }
    currentVisit++;
    vec2(-halfSize, -halfSize, nodeBounds.min);
    vec2(halfSize, halfSize, nodeBounds.max);
    this._applyToEntities(bounds, op, false);
  }

  _applyToEntities(
    bounds: Bounds,
    op: Entity => ?boolean,
    contained: boolean,
  ): boolean {
    for (const [entity, entityBounds] of this._entityBounds) {
      if (
        entity.visit !== currentVisit &&
        boundsIntersect(bounds, entityBounds)
      ) {
        entity.visit = currentVisit;
        if (op(entity) === false) {
          return false;
        }
      }
    }
    if (contained) {
      for (let ii = 0; ii < 4; ii++) {
        const child = this._children[ii];
        if (child && !child._applyToEntities(bounds, op, true)) {
          return false;
        }
      }
      return true;
    }
    const minX = nodeBounds.min.x;
    const minY = nodeBounds.min.y;
    const halfSize = (nodeBounds.max.x - nodeBounds.min.x) * 0.5;
    for (let ii = 0; ii < 4; ii++) {
      const child = this._children[ii];
      if (!child) {
        continue;
      }
      vec2(minX, minY, nodeBounds.min);
      vec2(minX + halfSize, minY + halfSize, nodeBounds.max);
      if (ii & 1) {
        nodeBounds.min.x += halfSize;
        nodeBounds.max.x += halfSize;
      }
      if (ii & 2) {
        nodeBounds.min.y += halfSize;
        nodeBounds.max.y += halfSize;
      }
      if (
        boundsIntersect(bounds, nodeBounds) &&
        !child._applyToEntities(bounds, op, boundsContain(bounds, nodeBounds))
      ) {
        return false;
      }
    }
    return true;
  }

  _getDepth(bounds: Bounds): number {
    const halfSize = this._halfSize;
    if (!halfSize) {
      throw new Error('Cannot get depth on non-root.');
    }
    const boundsSize = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
    );
    if (boundsSize === 0) {
      return MAX_DEPTH;
    }
    return Math.min(
      Math.round(Math.log(halfSize / boundsSize) / Math.LN2) + 1,
      MAX_DEPTH,
    );
  }

  _containsBounds(bounds: Bounds): boolean {
    const halfSize = this._halfSize;
    if (!halfSize) {
      throw new Error('Cannot check bounds on non-root.');
    }
    vec2(-halfSize, -halfSize, nodeBounds.min);
    vec2(halfSize, halfSize, nodeBounds.max);
    return boundsContain(nodeBounds, bounds);
  }

  _grow(): QuadtreeNode {
    const halfSize = this._halfSize;
    if (!halfSize) {
      throw new Error('Cannot grow non-root.');
    }
    // redistribute current children amongst new children
    const newHalfSize = halfSize * 2;
    const newParent = new QuadtreeNode(newHalfSize, this._totalBounds);
    for (let ii = 0; ii < 4; ii++) {
      const child = this._children[ii];
      if (child) {
        const newChild = (newParent._children[ii] = new QuadtreeNode());
        newChild._children[3 - ii] = child;
      }
    }
    // likewise with the entities of this node
    for (const [entity, bounds] of this._entityBounds) {
      for (let ii = 0; ii < 4; ii++) {
        vec2(-newHalfSize, -newHalfSize, nodeBounds.min);
        vec2(0.0, 0.0, nodeBounds.max);
        if (ii & 1) {
          nodeBounds.min.x += newHalfSize;
          nodeBounds.max.x += newHalfSize;
        }
        if (ii & 2) {
          nodeBounds.min.y += newHalfSize;
          nodeBounds.max.y += newHalfSize;
        }
        if (boundsIntersect(nodeBounds, bounds)) {
          let newChild = newParent._children[ii];
          if (!newChild) {
            newChild = newParent._children[ii] = new QuadtreeNode();
          }
          newChild._entityBounds.set(entity, bounds);
        }
      }
    }
    return newParent;
  }
}

function addToQuadtrees(
  idTree: IdTreeNode,
  quadtrees: Map<string, QuadtreeNode>,
  lineage: Entity[],
  dirtyBounds?: Map<string, Bounds>,
): Map<string, QuadtreeNode> {
  if (lineage.length < 2) {
    return quadtrees;
  }
  const newQuadtrees = new Map(quadtrees);
  const page = lineage[0].id;
  const root = newQuadtrees.get(page) || new QuadtreeNode(8);
  const bounds = getWorldBounds(idTree, lineage);
  newQuadtrees.set(page, root.addEntity(lineage[lineage.length - 1], bounds));
  if (dirtyBounds) {
    const pageBounds = dirtyBounds.get(page);
    if (pageBounds) {
      boundsUnionEquals(pageBounds, bounds);
    } else {
      dirtyBounds.set(page, {min: equals(bounds.min), max: equals(bounds.max)});
    }
  }
  return newQuadtrees;
}

function removeFromQuadtrees(
  idTree: IdTreeNode,
  quadtrees: Map<string, QuadtreeNode>,
  lineage: Entity[],
  dirtyBounds?: Map<string, Bounds>,
): Map<string, QuadtreeNode> {
  if (lineage.length < 2) {
    return quadtrees;
  }
  const newQuadtrees = new Map(quadtrees);
  const page = lineage[0].id;
  let root = newQuadtrees.get(page);
  if (root) {
    const bounds = getWorldBounds(idTree, lineage);
    root = root.removeEntity(lineage[lineage.length - 1], bounds);
    if (root.isEmpty()) {
      newQuadtrees.delete(page);
    } else {
      newQuadtrees.set(page, root);
    }
    if (dirtyBounds) {
      const pageBounds = dirtyBounds.get(page);
      if (pageBounds) {
        boundsUnionEquals(pageBounds, bounds);
      } else {
        dirtyBounds.set(page, {
          min: equals(bounds.min),
          max: equals(bounds.max),
        });
      }
    }
  }
  return newQuadtrees;
}

function getWorldBounds(idTree: IdTreeNode, lineage: Entity[]): Bounds {
  return lineage[lineage.length - 1].getCachedValue(
    'worldBounds',
    computeWorldBounds,
    idTree,
    lineage,
  );
}

function computeWorldBounds(idTree: IdTreeNode, lineage: Entity[]): Bounds {
  const lastEntity = lineage[lineage.length - 1];
  const bounds = emptyBounds();
  let maxThickness = 0.0;
  for (const key in lastEntity.state) {
    const data = ComponentBounds[key];
    if (data) {
      maxThickness = Math.max(
        maxThickness,
        data.addToBounds(idTree, lastEntity, bounds),
      );
    }
  }
  transformBoundsEquals(bounds, getWorldTransform(lineage));
  return expandBoundsEquals(bounds, maxThickness);
}

/**
 * Gets the world transform of an entity given its complete lineage.
 *
 * @param lineage the entity's lineage.
 * @return the entity's world transform.
 */
export function getWorldTransform(lineage: Entity[]): Transform {
  const lastIndex = lineage.length - 1;
  if (lastIndex < 0) {
    return null;
  }
  return lineage[lastIndex].getCachedValue(
    'worldTransform',
    computeWorldTransform,
    lineage,
  );
}

function computeWorldTransform(lineage: Entity[]): Transform {
  const lastIndex = lineage.length - 1;
  const lastEntity = lineage[lastIndex];
  const localTransform = lastEntity.state.transform;
  if (lastIndex === 0) {
    return localTransform;
  }
  return composeTransforms(
    lineage[lastIndex - 1].getCachedValue(
      'worldTransform',
      computeWorldTransform,
      lineage.slice(0, lastIndex),
    ),
    localTransform,
  );
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
  _quadtrees: Map<string, QuadtreeNode>;
  _dirtyBounds: ?Map<string, Bounds>;
  _initialEntities: ?Object;

  /** Returns a reference to the id tree root node. */
  get idTree(): IdTreeNode {
    return this._idTree;
  }

  /** Returns a reference to the entity hierarchy root node. */
  get entityHierarchy(): EntityHierarchyNode {
    return this._entityHierarchy;
  }

  constructor(
    jsonOrIdTree: Object,
    entityHierarchy?: EntityHierarchyNode,
    quadtrees?: Map<string, QuadtreeNode>,
    dirtyBounds?: Map<string, Bounds>,
  ) {
    super();
    if (jsonOrIdTree instanceof IdTreeNode) {
      this._idTree = jsonOrIdTree;
      if (!entityHierarchy) {
        throw new Error('Missing entity hierarchy.');
      }
      this._entityHierarchy = entityHierarchy;
      if (!quadtrees) {
        throw new Error('Missing quadtrees.');
      }
      this._quadtrees = quadtrees;
      this._dirtyBounds = dirtyBounds;
    } else {
      this._idTree = new IdTreeLeafNode();
      this._entityHierarchy = new EntityHierarchyNode();
      this._quadtrees = new Map();
      const storedEntities = jsonOrIdTree.entities;
      storedEntities && this._createEntities(storedEntities);
      // create the initial entities that don't yet exist
      this._createEntities(this._getInitialEntities(), storedEntities);
    }
  }

  /**
   * Returns the overall bounds of the identified page.
   *
   * @param page the id of the page of interest.
   * @return the total bounds, if any.
   */
  getTotalBounds(page: string): ?Bounds {
    const quadtree = this._quadtrees.get(page);
    return quadtree && quadtree.totalBounds;
  }

  /**
   * Retrieves the dirty bounds of the identified page (the region affected by
   * the last edit, if any).
   *
   * @param page the id of the page of interest.
   * @return the dirty bounds, if any.
   */
  getDirtyBounds(page: string): ?Bounds {
    return this._dirtyBounds && this._dirtyBounds.get(page);
  }

  _init() {
    this._idTree.ref();
  }

  _dispose() {
    this._idTree.deref();
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
      addToQuadtrees(newIdTree, this._quadtrees, lineage),
    );
  }

  /**
   * Given an entity id, returns its world transform.
   *
   * @param id the id of the entity of interest.
   * @return the entity's world transform.
   */
  getWorldTransform(id: string): Transform {
    return getWorldTransform(this.getEntityLineage(this.getEntity(id)));
  }

  /**
   * Given an entity id, returns its world bounds.
   *
   * @param id the id of the entity of interest.
   * @return the entity's world bounds.
   */
  getWorldBounds(id: string): Bounds {
    return getWorldBounds(
      this._idTree,
      this.getEntityLineage(this.getEntity(id)),
    );
  }

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
      removeFromQuadtrees(this._idTree, this._quadtrees, lineage),
    );
  }

  /**
   * Applies an operation to all entities whose bounds intersect the ones
   * provided.
   *
   * @param page the page to search.
   * @param bounds the bounds to check.
   * @param op the operation to perform on each entity.  Return false to abort
   * the search.
   */
  applyToEntities(page: string, bounds: Bounds, op: Entity => ?boolean) {
    const quadtree = this._quadtrees.get(page);
    quadtree && quadtree.applyToEntities(bounds, op);
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
          node.applyToEntityIds(id => {
            const entity = this.getEntity(id);
            if (entity) {
              reversed[id] = entity.state;
            }
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
    const removeFromHierarchy: Set<Entity> = new Set();
    const removeFromQuadtree: Set<Entity> = new Set();
    const addToHierarchy: Set<Entity> = new Set();
    const addToQuadtree: Set<Entity> = new Set();
    for (const id in map) {
      const state = map[id];
      let oldEntity: ?Entity;
      if (state === null) {
        // remove entity and all descendants
        oldEntity = this._idTree.getEntity(id);
        if (oldEntity) {
          removeFromHierarchy.add(oldEntity);
          const node = this._entityHierarchy.getNode(
            this._idTree.getEntityLineage(oldEntity),
          );
          node &&
            node.applyToEntityIds(id => {
              [newIdTree, oldEntity] = newIdTree.removeEntity(id);
              oldEntity && removeFromQuadtree.add(oldEntity);
            });
        }
      } else {
        let newEntity: Entity;
        [newIdTree, oldEntity, newEntity] = newIdTree.editEntity(id, state);
        if (oldEntity) {
          let hierarchyChanged = false;
          let transformChanged = false;
          const lineage = this._idTree.getEntityLineage(oldEntity);
          for (const entity of lineage) {
            const state = map[entity.id];
            if (!state) {
              continue;
            }
            if (
              state.name !== undefined ||
              state.order !== undefined ||
              state.parent !== undefined
            ) {
              hierarchyChanged = true;
            }
            if (state.transform !== undefined) {
              transformChanged = true;
            }
          }

          // always remove/reinsert into quadtree
          removeFromQuadtree.add(oldEntity);
          addToQuadtree.add(newEntity);

          // hierarchy only if hierarchy properties changed
          if (hierarchyChanged) {
            removeFromHierarchy.add(oldEntity);
            addToHierarchy.add(newEntity);
          }

          // if hierarchy or transform changed, visit descendants
          if (hierarchyChanged || transformChanged) {
            const node = this._entityHierarchy.getNode(
              this._idTree.getEntityLineage(oldEntity),
            );
            node &&
              node.applyToEntityIds(otherId => {
                if (id === otherId) {
                  return;
                }
                if (map[otherId] !== undefined) {
                  return false;
                }
                [newIdTree, oldEntity, newEntity] = newIdTree.editEntity(
                  otherId,
                  null,
                );
                addToQuadtree.add(newEntity);
                hierarchyChanged && addToHierarchy.add(newEntity);
                if (oldEntity) {
                  removeFromQuadtree.add(oldEntity);
                }
              });
          }
        } else {
          addToHierarchy.add(newEntity);
          addToQuadtree.add(newEntity);
        }
      }
    }

    // process removals with old id tree
    let newEntityHierarchy = this._entityHierarchy;
    for (const entity of removeFromHierarchy) {
      const lineage = this._idTree.getEntityLineage(entity);
      newEntityHierarchy = newEntityHierarchy.removeEntity(lineage);
    }
    let newQuadtrees = this._quadtrees;
    const dirtyBounds: Map<string, Bounds> = new Map();
    for (const entity of removeFromQuadtree) {
      const lineage = this._idTree.getEntityLineage(entity);
      newQuadtrees = removeFromQuadtrees(
        this._idTree,
        newQuadtrees,
        lineage,
        dirtyBounds,
      );
    }

    // then the additions with the new one
    for (const entity of addToHierarchy) {
      const lineage = newIdTree.getEntityLineage(entity);
      newEntityHierarchy = newEntityHierarchy.addEntity(lineage);
    }
    for (const entity of addToQuadtree) {
      const lineage = newIdTree.getEntityLineage(entity);
      newQuadtrees = addToQuadtrees(
        newIdTree,
        newQuadtrees,
        lineage,
        dirtyBounds,
      );
    }
    return new this.constructor(
      newIdTree,
      newEntityHierarchy,
      newQuadtrees,
      dirtyBounds,
    );
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
        this._quadtrees = addToQuadtrees(
          this._idTree,
          this._quadtrees,
          lineage,
        );
      }
    }
  }

  _getInitialEntities(): Object {
    if (!this._initialEntities) {
      this._initialEntities = this._createInitialEntities();
    }
    return this._initialEntities;
  }

  _createInitialEntities(): Object {
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
  _createInitialEntities(): Object {
    return {default: {}};
  }
}

/**
 * A scene representing a virtual construct.
 */
class Construct extends Scene {
  getType(): ResourceType {
    return 'construct';
  }
  _createInitialEntities(): Object {
    return {
      exterior: {},
      interior: {order: 1},
      root: {
        parent: {ref: 'exterior'},
      },
      inputBus: {
        parent: {ref: 'interior'},
        transform: {
          translation: vec2(-20.0),
        },
        inputBus: {order: 1},
        moduleRenderer: {order: 2},
      },
      outputBus: {
        parent: {ref: 'interior'},
        order: 1,
        transform: {
          translation: vec2(20.0),
        },
        outputBus: {order: 1},
        moduleRenderer: {order: 2},
      },
    };
  }
}

// register the type constructors for deserialization
addResourceTypeConstructor('environment', Environment);
addResourceTypeConstructor('construct', Construct);

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
    if (key.charAt(0) === '_') {
      if (key === '_type') {
        // preserve optional type
        reversed._type = edit._type;
      }
      continue; // derived property; skip
    }
    const stateValue = state[key];
    const editValue = edit[key];
    if (stateValue === undefined || stateValue === null) {
      reversed[key] = null;
    } else if (
      typeof stateValue === 'object' &&
      typeof editValue === 'object' &&
      !Array.isArray(stateValue) &&
      !Array.isArray(editValue) &&
      editValue !== null
    ) {
      reversed[key] = reverseEdit(stateValue, editValue);
    } else {
      reversed[key] = stateValue;
    }
  }
  return reversed;
}

/**
 * Applies an edit to a state object.
 *
 * @param state the original state.
 * @param edit the edit to apply.
 * @return the edited state.
 */
export function applyEdit(state: Object, edit: Object): Object {
  const edited = {};
  for (const key in state) {
    if (key.charAt(0) === '_') {
      continue; // derived property; skip
    }
    const stateValue = state[key];
    const editValue = edit[key];
    if (editValue === undefined) {
      // not in edit; use existing value
      edited[key] = stateValue;
    } else if (editValue === null) {
      // deleted in edit
    } else if (
      typeof stateValue === 'object' &&
      stateValue !== null &&
      typeof editValue === 'object' &&
      !Array.isArray(stateValue) &&
      !Array.isArray(editValue)
    ) {
      // values are mergeable; apply recursively
      edited[key] = applyEdit(stateValue, editValue);
    } else {
      // values not mergeable; use edit value
      edited[key] = editValue;
    }
  }
  // add anything from the edit that wasn't in the state
  for (const key in edit) {
    if (state[key] === undefined && key.charAt(0) !== '_') {
      const editValue = edit[key];
      editValue === null || (edited[key] = editValue);
    }
  }
  return edited;
}

/**
 * Merges two entity edits into one.
 *
 * @param first the first edit to merge.
 * @param second the second edit to merge.
 * @return the merged edit.
 */
export function mergeEdits(first: Object, second: Object): Object {
  const merged = {};
  for (const key in first) {
    if (key.charAt(0) === '_') {
      if (key === '_type') {
        // preserve optional type
        const firstType = first._type;
        if (firstType === second._type) {
          merged._type = firstType;
        }
      }
      continue; // derived property; skip
    }
    const firstValue = first[key];
    const secondValue = second[key];
    if (secondValue === undefined) {
      // not in second; use value from first
      merged[key] = firstValue;
    } else if (
      typeof firstValue === 'object' &&
      firstValue !== null &&
      typeof secondValue === 'object' &&
      secondValue !== null &&
      !Array.isArray(firstValue) &&
      !Array.isArray(secondValue)
    ) {
      // values are mergeable; merge recursively
      merged[key] = mergeEdits(firstValue, secondValue);
    } else {
      // values not mergeable; use second value
      merged[key] = secondValue;
    }
  }
  // add anything from the second that wasn't in the first
  for (const key in second) {
    if (first[key] === undefined && key.charAt(0) !== '_') {
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
    create: (
      map: Object,
      undoable: boolean = true,
      editNumber: number = currentEditNumber,
    ) => ({
      type: 'editEntities',
      map,
      undoable,
      editNumber,
    }),
    reduce: (state: Scene, action: ResourceAction) => {
      return state.applyEdit(action.map);
    },
    reduceUndoStack: (
      state: Scene,
      undoStack: ResourceAction[],
      action: ResourceAction,
    ) => {
      if (!action.undoable) {
        return undoStack;
      }
      const reverseEdit = state.createReverseEdit(action.map);
      const undoIndex = undoStack.length - 1;
      if (undoIndex >= 0) {
        const lastUndo = undoStack[undoIndex];
        if (
          lastUndo.type === 'editEntities' &&
          lastUndo.editNumber === action.editNumber
        ) {
          // merge into existing edit
          const map = mergeEdits(reverseEdit, lastUndo.map);
          return (undoStack
            .slice(0, undoIndex)
            .concat([Object.assign({}, lastUndo, {map})]): ResourceAction[]);
        }
      }
      return (undoStack.concat([
        SceneActions.editEntities.create(reverseEdit, true, action.editNumber),
      ]): ResourceAction[]);
    },
  },
};
