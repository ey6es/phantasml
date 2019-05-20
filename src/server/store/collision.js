/**
 * Collision geometry.
 *
 * @module server/store/collision
 * @flow
 */

import type {Vector2, Transform, Bounds} from './math';
import {
  getTransformMatrix,
  getTransformInverseMatrix,
  vec2,
  equals,
  negative,
  negativeEquals,
  minus,
  minusEquals,
  plus,
  plusEquals,
  times,
  timesEquals,
  orthonormalizeEquals,
  distance,
  squareDistance,
  length,
  dot,
  cross,
  transformPointEquals,
  mix,
  emptyBounds,
  boundsIntersect,
  boundsContain,
  expandBoundsEquals,
  addToBoundsEquals,
  transformBounds,
  boundsUnionEquals,
  getBoundsSize,
} from './math';

const penetration = vec2();
const otherPenetration = vec2();
const vertex = vec2();
const from = vec2();
const to = vec2();
const featurePenetration = vec2();
const point = vec2();
const begin = vec2();
const finish = vec2();
const vector = vec2();
const testBounds = emptyBounds();
const geometryBounds = emptyBounds();
const nodeBounds = emptyBounds();

/**
 * Interface for sources of vertex/thicknesses data.
 */
export interface VertexThicknesses {
  /**
   * Retrieves the bounds of the vertices.
   *
   * @param bounds the bounds object to populate.
   */
  getBounds(bounds: Bounds): void;

  /**
   * Returns the number of vertices in the source.
   *
   * @return the vertex count.
   */
  getVertexCount(): number;

  /**
   * Retrieves the vertex and thickness at the specified index.
   *
   * @param index the index of the vertex/thickness to fetch.
   * @param vertex the vector to hold the vertex.
   * @return the thickness.
   */
  getVertexThickness(index: number, vertex: Vector2): number;

  /**
   * Checks whether the identified edge is external.
   *
   * @param index the index of the edge to check.
   * @return whether or not the edge is external.
   */
  isExternalEdge(index: number): boolean;
}

/**
 * Wraps separate arrays of vertices and thicknesses.
 *
 * @param vertices the array of vertices.
 * @param [thicknesses] optional array of thicknesses.
 */
export class VertexThicknessArray implements VertexThicknesses {
  _vertices: Vector2[];
  _thicknesses: ?(number[]);

  constructor(vertices: Vector2[], thicknesses?: number[]) {
    this._vertices = vertices;
    this._thicknesses = thicknesses;
  }

  getBounds(bounds: Bounds) {
    emptyBounds(bounds);
    for (const vertex of this._vertices) {
      addToBoundsEquals(bounds, vertex.x, vertex.y);
    }
    this._thicknesses &&
      expandBoundsEquals(bounds, Math.max(...this._thicknesses));
  }

  getVertexCount(): number {
    return this._vertices.length;
  }

  getVertexThickness(index: number, vertex: Vector2): number {
    equals(this._vertices[index], vertex);
    return this._thicknesses ? this._thicknesses[index] : 0.0;
  }

  isExternalEdge(index: number): boolean {
    return true;
  }
}

class IndexedVertexThicknesses implements VertexThicknesses {
  _geometry: CollisionGeometry;
  _indices: number[];
  _bounds: Bounds;

  constructor(geometry: CollisionGeometry, indices: number[], bounds: Bounds) {
    this._geometry = geometry;
    this._indices = indices;
    this._bounds = bounds;
  }

  getBounds(bounds: Bounds) {
    equals(this._bounds.min, bounds.min);
    equals(this._bounds.max, bounds.max);
  }

  getVertexCount(): number {
    return this._indices.length;
  }

  getVertexThickness(index: number, vertex: Vector2): number {
    return this._geometry._getVertexThickness(this._indices[index], vertex);
  }

  isExternalEdge(index: number): boolean {
    const fromIndex = this._indices[index];
    const toIndex = this._indices[(index + 1) % this._indices.length];
    let adjacentIndex = this._geometry._adjacentIndices.get(fromIndex);
    adjacentIndex === undefined && (adjacentIndex = fromIndex + 1);
    return toIndex === adjacentIndex;
  }
}

class TransformedVertexThicknesses extends IndexedVertexThicknesses {
  _matrix: number[];
  _radius: number;

  constructor(
    geometry: CollisionGeometry,
    indices: number[],
    bounds: Bounds,
    matrix: number[],
    radius: number,
  ) {
    super(geometry, indices, bounds);
    this._matrix = matrix;
    this._radius = radius;
  }

  getBounds(bounds: Bounds) {
    transformBounds(this._bounds, this._matrix, bounds);
    expandBoundsEquals(bounds, this._radius);
  }

  getVertexThickness(index: number, vertex: Vector2): number {
    const thickness = this._geometry._getVertexThickness(
      this._indices[index],
      vertex,
    );
    transformPointEquals(vertex, this._matrix);
    return thickness + this._radius;
  }
}

/**
 * Base class for collision elements (paths, polygons).
 *
 * @param bounds the bounds of the element.
 */
export class CollisionElement {
  visit: ?number;

  _bounds: Bounds;

  /** Returns the bounds of the element. */
  get bounds(): Bounds {
    return this._bounds;
  }

  constructor(bounds: Bounds) {
    this._bounds = bounds;
  }

  /**
   * Finds the position of the nearest feature (vertex, edge) to the position
   * provided within the given radius.
   *
   * @param geometry the containing geometry.
   * @param position the position to search near.
   * @param radius the radius to search within.
   * @param nearest the current nearest position, if any.
   * @return the nearest position, if any.
   */
  getNearestFeaturePosition(
    geometry: CollisionGeometry,
    position: Vector2,
    radius: number,
    nearest: ?Vector2,
  ): ?Vector2 {
    throw new Error('Not implemented.');
  }

  /**
   * Gets the penetration of another geometry into this one.
   *
   * @param geometry the containing geometry.
   * @param other the other geometry to check against.
   * @param transform the transform to apply to this geometry before testing it
   * against the other.
   * @param radius the intersection radius.
   * @param result the vector to hold the result.
   * @param [allResults] if provided, an array to populate with all the
   * penetrations.
   */
  getPenetration(
    geometry: CollisionGeometry,
    other: CollisionGeometry,
    transform: Transform,
    radius: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    throw new Error('Not implemented.');
  }

  /**
   * Finds the penetration of a point into the geometry.
   *
   * @param geometry the containing geometry.
   * @param vertex the vertex to check.
   * @param vertexThickness the thickness associated with the vertex.
   * @param result the vector to hold the result.
   * @param [allResults] if provided, an array to populate with all the
   * penetrations.
   */
  getPointPenetration(
    geometry: CollisionGeometry,
    vertex: Vector2,
    vertexThickness: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    throw new Error('Not implemented.');
  }

  /**
   * Finds the penetration of a segment into the geometry.
   *
   * @param geometry the containing geometry.
   * @param start the start of the segment.
   * @param end the end of the segment.
   * @param startThickness the thickness associated with the start.
   * @param endThickness the thickness associated with the end.
   * @param result a vector to hold the result.
   */
  getSegmentPenetration(
    geometry: CollisionGeometry,
    start: Vector2,
    end: Vector2,
    startThickness: number,
    endThickness: number,
    result: Vector2,
  ) {
    throw new Error('Not implemented.');
  }

  /**
   * Finds the penetration of a polygon into the geometry.
   *
   * @param geometry the containing geometry.
   * @param vertexThicknesses the vertices and thicknesses of the polygon.
   * @param result a vector to hold the result.
   * @param resultIndex the index of the current penetrated side.
   * @return the index of the penetrated side, if any.
   */
  getPolygonPenetration(
    geometry: CollisionGeometry,
    vertexThicknesses: VertexThicknesses,
    result: Vector2,
    resultIndex: number,
  ): number {
    throw new Error('Not implemented.');
  }

  _computeAreaAndCenterOfMass(
    geometry: CollisionGeometry,
    centerOfMass: Vector2,
    addQuad: () => void,
  ): number {
    throw new Error('Not implemented.');
  }

  _computeMomentOfInertia(
    geometry: CollisionGeometry,
    addQuad: () => void,
  ): number {
    throw new Error('Not implemented.');
  }
}

/**
 * A path within the collision geometry.
 *
 * @param bounds the bounds of the path.
 * @param firstIndex the index of the first vertex in the path.
 * @param lastIndex the index of the last vertex (exclusive).
 * @param loop whether or not the path loops.
 */
export class CollisionPath extends CollisionElement {
  _firstIndex: number;
  _lastIndex: number;
  _loop: boolean;

  constructor(
    bounds: Bounds,
    firstIndex: number,
    lastIndex: number,
    loop: boolean,
  ) {
    super(bounds);
    this._firstIndex = firstIndex;
    this._lastIndex = lastIndex;
    this._loop = loop;
  }

  getNearestFeaturePosition(
    geometry: CollisionGeometry,
    position: Vector2,
    radius: number,
    nearest: ?Vector2,
  ): ?Vector2 {
    let nearestDistance = nearest ? distance(nearest, position) : radius;
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const vertexThickness = geometry._getVertexThickness(finalIndex, vertex);
      const dist = distance(vertex, position) - vertexThickness;
      if (dist < nearestDistance) {
        nearest = equals(vertex, nearest);
        nearestDistance = dist;
      }
      return nearest;
    }
    const endIndex = this._loop ? this._lastIndex : finalIndex;
    for (let fromIndex = this._firstIndex; fromIndex < endIndex; fromIndex++) {
      const toIndex =
        fromIndex === finalIndex ? this._firstIndex : fromIndex + 1;
      const fromThickness = geometry._getVertexThickness(fromIndex, from);
      const toThickness = geometry._getVertexThickness(toIndex, to);
      const vertexThickness = getNearestPointOnSegment(
        from,
        to,
        fromThickness,
        toThickness,
        position,
        vertex,
      );
      const dist = distance(vertex, position) - vertexThickness;
      if (dist < nearestDistance) {
        nearest = equals(vertex, nearest);
        nearestDistance = dist;
      }
    }
    return nearest;
  }

  getPenetration(
    geometry: CollisionGeometry,
    other: CollisionGeometry,
    transform: Transform,
    radius: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    const matrix = getTransformMatrix(transform);
    let resultLength = length(result);
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const vertexThickness = geometry._getVertexThickness(finalIndex, vertex);
      other.getPointPenetration(
        transformPointEquals(vertex, matrix),
        vertexThickness + radius,
        otherPenetration,
      );
      const penetrationLength = length(otherPenetration);
      if (penetrationLength > resultLength) {
        negative(otherPenetration, result);
        resultLength = penetrationLength;
      }
      if (allResults && penetrationLength > 0.0) {
        allResults.push({
          penetration: negative(otherPenetration),
          fromIndex: finalIndex,
          toIndex: finalIndex,
        });
      }
      return;
    }
    const endIndex = this._loop ? this._lastIndex : finalIndex;
    for (let fromIndex = this._firstIndex; fromIndex < endIndex; fromIndex++) {
      const toIndex =
        fromIndex === finalIndex ? this._firstIndex : fromIndex + 1;
      const fromThickness = geometry._getVertexThickness(fromIndex, from);
      const toThickness = geometry._getVertexThickness(toIndex, to);
      other.getSegmentPenetration(
        transformPointEquals(from, matrix),
        transformPointEquals(to, matrix),
        fromThickness + radius,
        toThickness + radius,
        otherPenetration,
      );
      const penetrationLength = length(otherPenetration);
      if (penetrationLength > resultLength) {
        negative(otherPenetration, result);
        resultLength = penetrationLength;
      }
      if (allResults && penetrationLength > 0.0) {
        allResults.push({
          penetration: negative(otherPenetration),
          fromIndex,
          toIndex,
        });
      }
    }
  }

  getPointPenetration(
    geometry: CollisionGeometry,
    vertex: Vector2,
    vertexThickness: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    let resultLength = length(result);
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const pointThickness = geometry._getVertexThickness(finalIndex, point);
      getPointPointPenetration(
        point,
        pointThickness,
        vertex,
        vertexThickness,
        featurePenetration,
      );
      const penetrationLength = length(featurePenetration);
      if (penetrationLength > resultLength) {
        equals(featurePenetration, result);
        resultLength = penetrationLength;
      }
      if (allResults && penetrationLength > 0.0) {
        allResults.push({
          penetration: equals(featurePenetration),
          fromIndex: finalIndex,
          toIndex: finalIndex,
        });
      }
      return;
    }
    const endIndex = this._loop ? this._lastIndex : finalIndex;
    for (let fromIndex = this._firstIndex; fromIndex < endIndex; fromIndex++) {
      const toIndex =
        fromIndex === finalIndex ? this._firstIndex : fromIndex + 1;
      const beginThickness = geometry._getVertexThickness(fromIndex, begin);
      const finishThickness = geometry._getVertexThickness(toIndex, finish);
      getSegmentPointPenetration(
        begin,
        finish,
        beginThickness,
        finishThickness,
        vertex,
        vertexThickness,
        featurePenetration,
      );
      const penetrationLength = length(featurePenetration);
      if (penetrationLength > resultLength) {
        equals(featurePenetration, result);
        resultLength = penetrationLength;
      }
      if (allResults && penetrationLength > 0.0) {
        allResults.push({
          penetration: equals(featurePenetration),
          fromIndex,
          toIndex,
        });
      }
    }
  }

  getSegmentPenetration(
    geometry: CollisionGeometry,
    start: Vector2,
    end: Vector2,
    startThickness: number,
    endThickness: number,
    result: Vector2,
  ) {
    let resultLength = length(result);
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const pointThickness = geometry._getVertexThickness(finalIndex, point);
      getSegmentPointPenetration(
        start,
        end,
        startThickness,
        endThickness,
        point,
        pointThickness,
        featurePenetration,
      );
      const penetrationLength = length(featurePenetration);
      if (penetrationLength > resultLength) {
        negative(featurePenetration, result);
        resultLength = penetrationLength;
      }
      return;
    }
    const endIndex = this._loop ? this._lastIndex : finalIndex;
    for (let fromIndex = this._firstIndex; fromIndex < endIndex; fromIndex++) {
      const toIndex =
        fromIndex === finalIndex ? this._firstIndex : fromIndex + 1;
      const beginThickness = geometry._getVertexThickness(fromIndex, begin);
      const finishThickness = geometry._getVertexThickness(toIndex, finish);
      getSegmentSegmentPenetration(
        begin,
        finish,
        beginThickness,
        finishThickness,
        start,
        end,
        startThickness,
        endThickness,
        featurePenetration,
      );
      const penetrationLength = length(featurePenetration);
      if (penetrationLength > resultLength) {
        equals(featurePenetration, result);
        resultLength = penetrationLength;
      }
    }
  }

  getPolygonPenetration(
    geometry: CollisionGeometry,
    vertexThicknesses: VertexThicknesses,
    result: Vector2,
    resultIndex: number,
  ): number {
    let resultLength = length(result);
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const pointThickness = geometry._getVertexThickness(finalIndex, point);
      const index = getPolygonPointPenetration(
        vertexThicknesses,
        point,
        pointThickness,
        featurePenetration,
      );
      const penetrationLength = length(featurePenetration);
      if (penetrationLength > resultLength) {
        negative(featurePenetration, result);
        resultLength = penetrationLength;
        resultIndex = index;
      }
      return resultIndex;
    }
    const endIndex = this._loop ? this._lastIndex : finalIndex;
    for (let fromIndex = this._firstIndex; fromIndex < endIndex; fromIndex++) {
      const toIndex =
        fromIndex === finalIndex ? this._firstIndex : fromIndex + 1;
      const beginThickness = geometry._getVertexThickness(fromIndex, begin);
      const finishThickness = geometry._getVertexThickness(toIndex, finish);
      const index = getPolygonSegmentPenetration(
        vertexThicknesses,
        begin,
        finish,
        beginThickness,
        finishThickness,
        featurePenetration,
      );
      const penetrationLength = length(featurePenetration);
      if (penetrationLength > resultLength) {
        negative(featurePenetration, result);
        resultLength = penetrationLength;
        resultIndex = index;
      }
    }
    return resultIndex;
  }

  _computeAreaAndCenterOfMass(
    geometry: CollisionGeometry,
    centerOfMass: Vector2,
    addQuad: () => void,
  ): number {
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const vertexThickness = geometry._getVertexThickness(finalIndex, vertex);
      const area = vertexThickness * vertexThickness * Math.PI;
      plusEquals(centerOfMass, timesEquals(vertex, area));
      return area;
    }
    const endIndex = this._loop ? this._lastIndex : finalIndex;
    for (let fromIndex = this._firstIndex; fromIndex < endIndex; fromIndex++) {
      const toIndex =
        fromIndex === finalIndex ? this._firstIndex : fromIndex + 1;
      const fromThickness = geometry._getVertexThickness(fromIndex, from);
      const toThickness = geometry._getVertexThickness(toIndex, to);
      orthonormalizeEquals(minus(to, from, vector));
      times(vector, fromThickness, v1);
      times(vector, toThickness, v2);
      minus(from, v1, begin);
      minus(to, v2, finish);
      plusEquals(from, v1);
      plusEquals(to, v2);
      addQuad();
    }
    return 0.0;
  }

  _computeMomentOfInertia(
    geometry: CollisionGeometry,
    addQuad: () => void,
  ): number {
    const centerOfMass = geometry.centerOfMass;
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const vertexThickness = geometry._getVertexThickness(finalIndex, vertex);
      const area = vertexThickness * vertexThickness * Math.PI;
      // https://en.wikipedia.org/wiki/List_of_moments_of_inertia
      const base = 0.5 * area * vertexThickness * vertexThickness;
      return base + area * squareDistance(vertex, centerOfMass);
    }
    const endIndex = this._loop ? this._lastIndex : finalIndex;
    for (let fromIndex = this._firstIndex; fromIndex < endIndex; fromIndex++) {
      const toIndex =
        fromIndex === finalIndex ? this._firstIndex : fromIndex + 1;
      const fromThickness = geometry._getVertexThickness(fromIndex, from);
      const toThickness = geometry._getVertexThickness(toIndex, to);
      minusEquals(from, centerOfMass);
      minusEquals(to, centerOfMass);
      orthonormalizeEquals(minus(to, from, vector));
      times(vector, fromThickness, v1);
      times(vector, toThickness, v2);
      minus(from, v1, begin);
      minus(to, v2, finish);
      plusEquals(from, v1);
      plusEquals(to, v2);
      addQuad();
    }
    return 0.0;
  }
}

/**
 * A convex polygon within the collision geometry.
 *
 * @param bounds the bounds of the polygon.
 * @param indices the indices of the polygon's vertices.
 */
export class CollisionPolygon extends CollisionElement {
  _indices: number[];

  constructor(bounds: Bounds, indices: number[]) {
    super(bounds);
    this._indices = indices;
  }

  getNearestFeaturePosition(
    geometry: CollisionGeometry,
    position: Vector2,
    radius: number,
    nearest: ?Vector2,
  ): ?Vector2 {
    let nearestDistance = nearest ? distance(nearest, position) : radius;
    for (let ii = 0; ii < this._indices.length; ii++) {
      const fromIndex = this._indices[ii];
      const toIndex = this._indices[(ii + 1) % this._indices.length];
      const fromThickness = geometry._getVertexThickness(fromIndex, from);
      const toThickness = geometry._getVertexThickness(toIndex, to);
      const vertexThickness = getNearestPointOnSegment(
        from,
        to,
        fromThickness,
        toThickness,
        position,
        vertex,
      );
      const dist = distance(vertex, position) - vertexThickness;
      if (dist < nearestDistance) {
        nearest = equals(vertex, nearest);
        nearestDistance = dist;
      }
    }
    return nearest;
  }

  getPenetration(
    geometry: CollisionGeometry,
    other: CollisionGeometry,
    transform: Transform,
    radius: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    let resultLength = length(result);
    const index = other.getPolygonPenetration(
      new TransformedVertexThicknesses(
        geometry,
        this._indices,
        this._bounds,
        getTransformMatrix(transform),
        radius,
      ),
      otherPenetration,
    );
    const penetrationLength = length(otherPenetration);
    if (penetrationLength > resultLength) {
      negative(otherPenetration, result);
      resultLength = penetrationLength;
    }
    if (allResults && penetrationLength > 0.0) {
      allResults.push({
        penetration: negative(otherPenetration),
        fromIndex: this._indices[index],
        toIndex: this._indices[(index + 1) % this._indices.length],
      });
    }
  }

  getPointPenetration(
    geometry: CollisionGeometry,
    vertex: Vector2,
    vertexThickness: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    let resultLength = length(result);
    const index = getPolygonPointPenetration(
      new IndexedVertexThicknesses(geometry, this._indices, this._bounds),
      vertex,
      vertexThickness,
      featurePenetration,
    );
    const penetrationLength = length(featurePenetration);
    if (penetrationLength > resultLength) {
      equals(featurePenetration, result);
      resultLength = penetrationLength;
    }
    if (allResults && penetrationLength > 0.0) {
      allResults.push({
        penetration: equals(featurePenetration),
        fromIndex: this._indices[index],
        toIndex: this._indices[(index + 1) % this._indices.length],
      });
    }
  }

  getSegmentPenetration(
    geometry: CollisionGeometry,
    start: Vector2,
    end: Vector2,
    startThickness: number,
    endThickness: number,
    result: Vector2,
  ) {
    let resultLength = length(result);
    getPolygonSegmentPenetration(
      new IndexedVertexThicknesses(geometry, this._indices, this._bounds),
      start,
      end,
      startThickness,
      endThickness,
      featurePenetration,
    );
    const penetrationLength = length(featurePenetration);
    if (penetrationLength > resultLength) {
      equals(featurePenetration, result);
      resultLength = penetrationLength;
    }
  }

  getPolygonPenetration(
    geometry: CollisionGeometry,
    vertexThicknesses: VertexThicknesses,
    result: Vector2,
    resultIndex: number,
  ): number {
    let resultLength = length(result);
    const index = getPolygonPolygonPenetration(
      new IndexedVertexThicknesses(geometry, this._indices, this._bounds),
      vertexThicknesses,
      featurePenetration,
    );
    const penetrationLength = length(featurePenetration);
    if (penetrationLength > resultLength) {
      equals(featurePenetration, result);
      resultLength = penetrationLength;
      resultIndex = index;
    }
    return resultIndex;
  }

  _computeAreaAndCenterOfMass(
    geometry: CollisionGeometry,
    centerOfMass: Vector2,
    addQuad: () => void,
  ): number {
    // https://en.wikipedia.org/wiki/Centroid#Of_a_polygon
    let area = 0.0;
    vec2(0.0, 0.0, vertex);
    for (let ii = 0; ii < this._indices.length; ii++) {
      const fromIndex = this._indices[ii];
      const toIndex = this._indices[(ii + 1) % this._indices.length];
      const fromThickness = geometry._getVertexThickness(fromIndex, from);
      const toThickness = geometry._getVertexThickness(toIndex, to);
      const cp = cross(from, to);
      area += cp;
      vertex.x += (from.x + to.x) * cp;
      vertex.y += (from.y + to.y) * cp;

      // compute, add the extended side if outside edge
      let adjacentIndex = geometry._adjacentIndices.get(fromIndex);
      adjacentIndex === undefined && (adjacentIndex = fromIndex + 1);
      if (toIndex !== adjacentIndex) {
        continue;
      }
      orthonormalizeEquals(minus(to, from, vector));
      plusEquals(times(vector, -fromThickness, begin), from);
      plusEquals(times(vector, -toThickness, finish), to);
      addQuad();
    }
    area *= 0.5;
    plusEquals(centerOfMass, timesEquals(vertex, 1.0 / 6.0));
    return area;
  }

  _computeMomentOfInertia(
    geometry: CollisionGeometry,
    addQuad: () => void,
  ): number {
    const centerOfMass = geometry.centerOfMass;
    let dividend = 0.0;
    for (let ii = 0; ii < this._indices.length; ii++) {
      const fromIndex = this._indices[ii];
      const toIndex = this._indices[(ii + 1) % this._indices.length];
      const fromThickness = geometry._getVertexThickness(fromIndex, from);
      const toThickness = geometry._getVertexThickness(toIndex, to);
      minusEquals(from, centerOfMass);
      minusEquals(to, centerOfMass);

      const cp = cross(from, to);
      dividend += cp * (dot(from, from) + dot(from, to) + dot(to, to));

      // compute, add the extended side if outside edge
      let adjacentIndex = geometry._adjacentIndices.get(fromIndex);
      adjacentIndex === undefined && (adjacentIndex = fromIndex + 1);
      if (toIndex !== adjacentIndex) {
        continue;
      }
      orthonormalizeEquals(minus(to, from, vector));
      plusEquals(times(vector, -fromThickness, begin), from);
      plusEquals(times(vector, -toThickness, finish), to);
      addQuad();
    }
    return dividend / 12.0;
  }
}

/** The last visit identifier used for traversal. */
let currentVisit = 0;

const MAX_DEPTH = 16;

class QuadtreeNode {
  _elements: CollisionElement[] = [];
  _children: (?QuadtreeNode)[] = [];

  addElement(geometry: CollisionGeometry, element: CollisionElement) {
    let depth = MAX_DEPTH;
    const geometryBounds = geometry.bounds;
    const elementSize = getBoundsSize(element.bounds);
    if (elementSize > 0) {
      const geometrySize = getBoundsSize(geometryBounds);
      depth = Math.min(
        Math.round(Math.log(geometrySize / elementSize) / Math.LN2),
        MAX_DEPTH,
      );
    }
    equals(geometryBounds.min, nodeBounds.min);
    equals(geometryBounds.max, nodeBounds.max);
    this._addElement(element, depth);
  }

  _addElement(element: CollisionElement, depth: number) {
    if (depth === 0) {
      this._elements.push(element);
      return;
    }
    const minX = nodeBounds.min.x;
    const minY = nodeBounds.min.y;
    const maxX = nodeBounds.max.x;
    const maxY = nodeBounds.max.y;
    const halfX = (minX + maxX) * 0.5;
    const halfY = (minY + maxY) * 0.5;
    for (let ii = 0; ii < 4; ii++) {
      if (ii & 1) {
        nodeBounds.min.x = halfX;
        nodeBounds.max.x = maxX;
      } else {
        nodeBounds.min.x = minX;
        nodeBounds.max.x = halfX;
      }
      if (ii & 2) {
        nodeBounds.min.y = halfY;
        nodeBounds.max.y = maxY;
      } else {
        nodeBounds.min.y = minY;
        nodeBounds.max.y = halfY;
      }
      if (boundsIntersect(nodeBounds, element.bounds)) {
        let child = this._children[ii];
        if (!child) {
          this._children[ii] = child = new QuadtreeNode();
        }
        child._addElement(element, depth - 1);
      }
    }
  }

  applyToElements(
    geometry: CollisionGeometry,
    bounds: Bounds,
    op: CollisionElement => void,
  ) {
    currentVisit++;
    const geometryBounds = geometry.bounds;
    equals(geometryBounds.min, nodeBounds.min);
    equals(geometryBounds.max, nodeBounds.max);
    this._applyToElements(bounds, op, false);
  }

  _applyToElements(
    bounds: Bounds,
    op: CollisionElement => void,
    contained: boolean,
  ) {
    for (const element of this._elements) {
      if (
        element.visit !== currentVisit &&
        boundsIntersect(bounds, element.bounds)
      ) {
        element.visit = currentVisit;
        op(element);
      }
    }
    if (contained) {
      for (let ii = 0; ii < 4; ii++) {
        const child = this._children[ii];
        child && child._applyToElements(bounds, op, true);
      }
      return;
    }
    const minX = nodeBounds.min.x;
    const minY = nodeBounds.min.y;
    const maxX = nodeBounds.max.x;
    const maxY = nodeBounds.max.y;
    const halfX = (minX + maxX) * 0.5;
    const halfY = (minY + maxY) * 0.5;
    for (let ii = 0; ii < 4; ii++) {
      const child = this._children[ii];
      if (!child) {
        continue;
      }
      if (ii & 1) {
        nodeBounds.min.x = halfX;
        nodeBounds.max.x = maxX;
      } else {
        nodeBounds.min.x = minX;
        nodeBounds.max.x = halfX;
      }
      if (ii & 2) {
        nodeBounds.min.y = halfY;
        nodeBounds.max.y = maxY;
      } else {
        nodeBounds.min.y = minY;
        nodeBounds.max.y = halfY;
      }
      if (boundsIntersect(bounds, nodeBounds)) {
        child._applyToElements(bounds, op, boundsContain(bounds, nodeBounds));
      }
    }
  }
}

/** Contains information on a single penetration. */
export type PenetrationResult = {
  penetration: Vector2,
  fromIndex: number,
  toIndex: number,
};

/**
 * Geometry representation for collision detection/response.
 *
 * @param arrayBuffer the array containing the vertex data.
 * @param attributeSizes the map containing the size of the vertex attributes.
 * @param elements the elements in the geometry.
 * @param adjacentIndices adjacency for non-consecutive indices.
 */
export class CollisionGeometry {
  _arrayBuffer: Float32Array;
  _attributeOffsets: {[string]: number};
  _vertexSize: number;
  _elements: CollisionElement[];
  _bounds: Bounds;
  _adjacentIndices: Map<number, number>;
  _area: ?number;
  _centerOfMass: ?Vector2;
  _momentOfInertia: ?number;
  _quadtree: QuadtreeNode;

  /** Returns the bounds of the geometry. */
  get bounds(): Bounds {
    return this._bounds;
  }

  /** Retrieves the geometry's area, computing it if necessary. */
  get area(): number {
    if (this._area == null) {
      this._computeAreaAndCenterOfMass();
    }
    return (this._area: any);
  }

  /** Retrieves the geometry's center of mass, computing it if necessary. */
  get centerOfMass(): Vector2 {
    if (!this._centerOfMass) {
      this._computeAreaAndCenterOfMass();
    }
    return (this._centerOfMass: any);
  }

  /**
   * Retrieves the geometry's moment of inertia about its center of mass.
   * This does not factor in the density, so multiply by that before using.
   */
  get momentOfInertia(): number {
    if (this._momentOfInertia == null) {
      this._computeMomentOfInertia();
    }
    return (this._momentOfInertia: any);
  }

  constructor(
    arrayBuffer: Float32Array,
    attributeSizes: {[string]: number},
    elements: CollisionElement[],
    adjacentIndices: Map<number, number>,
  ) {
    this._arrayBuffer = arrayBuffer;
    this._attributeOffsets = {};
    let currentOffset = 0;
    for (const name in attributeSizes) {
      this._attributeOffsets[name] = currentOffset;
      currentOffset += attributeSizes[name];
    }
    this._vertexSize = currentOffset;
    this._bounds = emptyBounds();
    for (const element of elements) {
      boundsUnionEquals(this._bounds, element.bounds);
    }
    this._quadtree = new QuadtreeNode();
    for (const element of elements) {
      this._quadtree.addElement(this, element);
    }
    this._adjacentIndices = adjacentIndices;
  }

  /**
   * Retrieves a single float-valued attribute value for the identified vertex.
   *
   * @param index the index of the vertex to fetch.
   * @param name the name of the attribute desired.
   * @return the attribute value.
   */
  getFloatAttribute(index: number, name: string): number {
    const offset = this._attributeOffsets[name];
    return offset === undefined
      ? 0.0
      : this._arrayBuffer[index * this._vertexSize + offset];
  }

  /**
   * Returns the moment of inertia about the specified position.  This does not
   * factor in the density, so multiply by that before using.
   *
   * @param position the position of interest.
   * @return the moment of inertia about the position.
   */
  getMomentOfInertia(position: Vector2): number {
    // https://en.wikipedia.org/wiki/Parallel_axis_theorem
    return (
      this.momentOfInertia +
      this.area * squareDistance(this.centerOfMass, position)
    );
  }

  /**
   * Finds the position of the feature (vertex, edge) nearest to the position
   * provided.
   *
   * @param position the position to compare against.
   * @param radius the radius to use in the comparison.
   * @return the position of the nearest feature, if any.
   */
  getNearestFeaturePosition(position: Vector2, radius: number): ?Vector2 {
    equals(position, testBounds.min);
    equals(position, testBounds.max);
    expandBoundsEquals(testBounds, radius);
    let nearest: ?Vector2;
    this._quadtree.applyToElements(this, testBounds, element => {
      nearest = element.getNearestFeaturePosition(
        this,
        position,
        radius,
        nearest,
      );
    });
    return nearest;
  }

  /**
   * Checks this geometry for intersection with another within a radius.
   *
   * @param other the other geometry to check against.
   * @param transform the transform to apply to this geometry before testing it
   * against the other.
   * @param [radius=0] the intersection radius.
   * @return whether or not the two geometries intersect.
   */
  intersects(
    other: CollisionGeometry,
    transform: Transform,
    radius: number = 0.0,
  ): boolean {
    this.getPenetration(other, transform, radius, penetration);
    return length(penetration) > 0.0;
  }

  /**
   * Gets the penetration of another geometry into this one.
   *
   * @param other the other geometry to check against.
   * @param transform the transform to apply to this geometry before testing it
   * against the other.
   * @param radius the intersection radius.
   * @param result the vector to hold the result.
   * @param [allResults] if provided, an array to populate with all the
   * penetrations.
   */
  getPenetration(
    other: CollisionGeometry,
    transform: Transform,
    radius: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    transformBounds(
      other.bounds,
      getTransformInverseMatrix(transform),
      geometryBounds,
    );
    vec2(0.0, 0.0, result);
    this._quadtree.applyToElements(this, geometryBounds, element => {
      element.getPenetration(
        this,
        other,
        transform,
        radius,
        result,
        allResults,
      );
    });
  }

  /**
   * Checks for intersection of this geometry with a point.
   *
   * @param vertex the vertex to check.
   * @param [vertexThickness=0] the thickness associated with the vertex.
   * @return whether or not the point intersects.
   */
  intersectsPoint(vertex: Vector2, vertexThickness: number = 0.0): boolean {
    this.getPointPenetration(vertex, vertexThickness, penetration);
    return length(penetration) > 0.0;
  }

  /**
   * Finds the penetration of a point into the geometry.
   *
   * @param vertex the vertex to check.
   * @param vertexThickness the thickness associated with the vertex.
   * @param result the vector to hold the result.
   * @param [allResults] if provided, an array to populate with all the
   * penetrations.
   */
  getPointPenetration(
    vertex: Vector2,
    vertexThickness: number,
    result: Vector2,
    allResults?: PenetrationResult[],
  ) {
    equals(vertex, testBounds.min);
    equals(vertex, testBounds.max);
    expandBoundsEquals(testBounds, vertexThickness);
    vec2(0.0, 0.0, result);
    this._quadtree.applyToElements(this, testBounds, element => {
      element.getPointPenetration(
        this,
        vertex,
        vertexThickness,
        result,
        allResults,
      );
    });
  }

  /**
   * Checks whether a line segment intersects the geometry.
   *
   * @param start the start of the segment.
   * @param end the end of the segment.
   * @param [startThickness=0] the thickness associated with the start.
   * @param [endThickness=0] the thickness associated with the end.
   * @return whether or not the segment intersects.
   */
  intersectsSegment(
    start: Vector2,
    end: Vector2,
    startThickness: number = 0.0,
    endThickness: number = 0.0,
  ): boolean {
    this.getSegmentPenetration(
      start,
      end,
      startThickness,
      endThickness,
      penetration,
    );
    return length(penetration) > 0.0;
  }

  /**
   * Finds the penetration of a segment into the geometry.
   *
   * @param start the start of the segment.
   * @param end the end of the segment.
   * @param startThickness the thickness associated with the start.
   * @param endThickness the thickness associated with the end.
   * @param result a vector to hold the result.
   */
  getSegmentPenetration(
    start: Vector2,
    end: Vector2,
    startThickness: number,
    endThickness: number,
    result: Vector2,
  ) {
    emptyBounds(testBounds);
    addToBoundsEquals(testBounds, start.x, start.y);
    addToBoundsEquals(testBounds, end.x, end.y);
    expandBoundsEquals(testBounds, Math.max(startThickness, endThickness));
    vec2(0.0, 0.0, result);
    this._quadtree.applyToElements(this, testBounds, element => {
      element.getSegmentPenetration(
        this,
        start,
        end,
        startThickness,
        endThickness,
        result,
      );
    });
  }

  /**
   * Checks the geometry for intersection with a polygon.
   *
   * @param vertexThicknesses the vertices and thicknesses of the polygon.
   * @return whether or not the polygon intersects.
   */
  intersectsPolygon(vertexThicknesses: VertexThicknesses): boolean {
    this.getPolygonPenetration(vertexThicknesses, penetration);
    return length(penetration) > 0.0;
  }

  /**
   * Finds the penetration of a polygon into the geometry.
   *
   * @param vertexThicknesses the vertices and thicknesses of the polygon.
   * @param result a vector to hold the result.
   * @return the index of the penetrated side, if any.
   */
  getPolygonPenetration(
    vertexThicknesses: VertexThicknesses,
    result: Vector2,
  ): number {
    vertexThicknesses.getBounds(testBounds);
    vec2(0.0, 0.0, result);
    let resultIndex = 0;
    this._quadtree.applyToElements(this, testBounds, element => {
      resultIndex = element.getPolygonPenetration(
        this,
        vertexThicknesses,
        result,
        resultIndex,
      );
    });
    return resultIndex;
  }

  _computeAreaAndCenterOfMass() {
    const centerOfMass = vec2();
    let totalArea = 0.0;
    const addQuad = () => {
      const cp0 = cross(from, begin);
      const cp1 = cross(begin, finish);
      const cp2 = cross(finish, to);
      const cp3 = cross(to, from);
      centerOfMass.x +=
        ((from.x + begin.x) * cp0 +
          (begin.x + finish.x) * cp1 +
          (finish.x + to.x) * cp2 +
          (to.x + from.x) * cp3) /
        6.0;
      centerOfMass.y +=
        ((from.y + begin.y) * cp0 +
          (begin.y + finish.y) * cp1 +
          (finish.y + to.y) * cp2 +
          (to.y + from.y) * cp3) /
        6.0;
      totalArea += 0.5 * (cp0 + cp1 + cp2 + cp3);
    };
    this._quadtree.applyToElements(this, this._bounds, element => {
      totalArea += element._computeAreaAndCenterOfMass(
        this,
        centerOfMass,
        addQuad,
      );
    });
    if (totalArea > 0.0) {
      timesEquals(centerOfMass, 1.0 / totalArea);
    }
    this._area = totalArea;
    this._centerOfMass = centerOfMass;
  }

  _computeMomentOfInertia() {
    let momentOfInertia = 0.0;
    const addQuad = () => {
      const dp0 = dot(from, from);
      const dp1 = dot(begin, begin);
      const dp2 = dot(finish, finish);
      const dp3 = dot(to, to);
      momentOfInertia +=
        (cross(from, begin) * (dp0 + dot(from, begin) + dp1) +
          cross(begin, finish) * (dp1 + dot(begin, finish) + dp2) +
          cross(finish, to) * (dp2 + dot(finish, to) + dp3) +
          cross(to, from) * (dp3 + dot(to, from) + dp0)) /
        12.0;
    };
    this._quadtree.applyToElements(this, this._bounds, element => {
      momentOfInertia += element._computeMomentOfInertia(this, addQuad);
    });
    this._momentOfInertia = momentOfInertia;
  }

  _getVertexThickness(index: number, vertex: Vector2): number {
    const arrayIndex = index * this._vertexSize;
    const vertexIndex = arrayIndex + this._attributeOffsets.vertex;
    vec2(
      this._arrayBuffer[vertexIndex],
      this._arrayBuffer[vertexIndex + 1],
      vertex,
    );
    return this._arrayBuffer[arrayIndex + this._attributeOffsets.thickness];
  }
}

/**
 * Finds the penetration vector between two points.
 *
 * @param point the point to penetrate.
 * @param pointThickness the point's associated thickness.
 * @param vertex the penetrating vertex.
 * @param vertexThickness the thickness associated with the vertex.
 * @param result a vector to hold the result.
 */
export function getPointPointPenetration(
  point: Vector2,
  pointThickness: number,
  vertex: Vector2,
  vertexThickness: number,
  result: Vector2,
) {
  minus(point, vertex, result);
  const oldLength = length(result);
  const newLength = pointThickness + vertexThickness - oldLength;
  if (newLength <= 0.0) {
    vec2(0.0, 0.0, result);
  } else {
    timesEquals(result, newLength / oldLength);
  }
}

function getSegmentPointPenetration(
  start: Vector2,
  end: Vector2,
  startThickness: number,
  endThickness: number,
  vertex: Vector2,
  vertexThickness: number,
  result: Vector2,
) {
  if (distance(start, end) === 0.0) {
    getPointPointPenetration(
      start,
      Math.max(startThickness, endThickness),
      vertex,
      vertexThickness,
      result,
    );
    return;
  }
  vec2(0.0, 0.0, result);
  {
    const rightSide = getSidePointPenetration(
      start,
      end,
      startThickness,
      endThickness,
      vertex,
      vertexThickness,
      pointPenetration,
    );
    if (rightSide) {
      equals(pointPenetration, result);
      return;
    }
  }

  {
    const rightSide = getSidePointPenetration(
      end,
      start,
      endThickness,
      startThickness,
      vertex,
      vertexThickness,
      pointPenetration,
    );
    if (rightSide) {
      equals(pointPenetration, result);
    }
  }
}

function getSegmentSegmentPenetration(
  start: Vector2,
  end: Vector2,
  startThickness: number,
  endThickness: number,
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  result: Vector2,
) {
  if (distance(from, to) === 0.0) {
    getSegmentPointPenetration(
      start,
      end,
      startThickness,
      endThickness,
      from,
      Math.max(fromThickness, toThickness),
      result,
    );
    return;
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;

  {
    const allRightSide = getSideSegmentPenetration(
      start,
      end,
      startThickness,
      endThickness,
      from,
      to,
      fromThickness,
      toThickness,
      segmentPenetration,
    );
    if (allRightSide) {
      equals(segmentPenetration, result);
      return;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(segmentPenetration, result);
      resultLength = penetrationLength;
    }
  }

  {
    const allRightSide = getSideSegmentPenetration(
      end,
      start,
      endThickness,
      startThickness,
      from,
      to,
      fromThickness,
      toThickness,
      segmentPenetration,
    );
    if (allRightSide) {
      equals(segmentPenetration, result);
      return;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(segmentPenetration, result);
      resultLength = penetrationLength;
    }
  }

  {
    const allRightSide = getSideSegmentPenetration(
      from,
      to,
      fromThickness,
      toThickness,
      start,
      end,
      startThickness,
      endThickness,
      segmentPenetration,
    );
    if (allRightSide) {
      negative(segmentPenetration, result);
      return;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(segmentPenetration, result);
      resultLength = penetrationLength;
    }
  }

  {
    const allRightSide = getSideSegmentPenetration(
      to,
      from,
      toThickness,
      fromThickness,
      start,
      end,
      startThickness,
      endThickness,
      segmentPenetration,
    );
    if (allRightSide) {
      negative(segmentPenetration, result);
      return;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(segmentPenetration, result);
    }
  }
}

const pointPenetration = vec2();
const polygonPoint0 = vec2();
const polygonPoint1 = vec2();

function getPolygonPointPenetration(
  vertexThicknesses: VertexThicknesses,
  vertex: Vector2,
  vertexThickness: number,
  result: Vector2,
): number {
  const count = vertexThicknesses.getVertexCount();
  if (count === 1) {
    getPointPointPenetration(
      polygonPoint0,
      vertexThicknesses.getVertexThickness(0, polygonPoint0),
      vertex,
      vertexThickness,
      result,
    );
    return 0;
  }
  if (count === 2) {
    getSegmentPointPenetration(
      polygonPoint0,
      polygonPoint1,
      vertexThicknesses.getVertexThickness(0, polygonPoint0),
      vertexThicknesses.getVertexThickness(1, polygonPoint1),
      vertex,
      vertexThickness,
      result,
    );
    return 0;
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
  let resultIndex = 0;
  for (let ii = 0; ii < count; ii++) {
    const toIndex = (ii + 1) % count;
    const rightSide = getSidePointPenetration(
      polygonPoint0,
      polygonPoint1,
      vertexThicknesses.getVertexThickness(ii, polygonPoint0),
      vertexThicknesses.getVertexThickness(toIndex, polygonPoint1),
      vertex,
      vertexThickness,
      pointPenetration,
    );
    if (rightSide) {
      equals(pointPenetration, result);
      return ii;
    }
    const penetrationLength = length(pointPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(pointPenetration, result);
      resultLength = penetrationLength;
      resultIndex = ii;
    }
  }
  return resultIndex;
}

const segmentPenetration = vec2();
const polygonSegment0 = vec2();
const polygonSegment1 = vec2();

function getPolygonSegmentPenetration(
  vertexThicknesses: VertexThicknesses,
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  result: Vector2,
): number {
  const count = vertexThicknesses.getVertexCount();
  if (count === 1) {
    getSegmentPointPenetration(
      from,
      to,
      fromThickness,
      toThickness,
      polygonSegment0,
      vertexThicknesses.getVertexThickness(0, polygonSegment0),
      result,
    );
    negativeEquals(result);
    return 0;
  }
  if (count === 2) {
    getSegmentSegmentPenetration(
      polygonSegment0,
      polygonSegment1,
      vertexThicknesses.getVertexThickness(0, polygonSegment0),
      vertexThicknesses.getVertexThickness(1, polygonSegment1),
      from,
      to,
      fromThickness,
      toThickness,
      result,
    );
    return 0;
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
  let resultIndex = 0;
  for (let ii = 0; ii < count; ii++) {
    const toIndex = (ii + 1) % count;
    const allRightSide = getSideSegmentPenetration(
      polygonSegment0,
      polygonSegment1,
      vertexThicknesses.getVertexThickness(ii, polygonSegment0),
      vertexThicknesses.getVertexThickness(toIndex, polygonSegment1),
      from,
      to,
      fromThickness,
      toThickness,
      segmentPenetration,
    );
    if (allRightSide) {
      equals(segmentPenetration, result);
      return ii;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(segmentPenetration, result);
      resultLength = penetrationLength;
      resultIndex = ii;
    }
  }

  {
    const [allRightSide, index] = getSidePolygonPenetration(
      from,
      to,
      fromThickness,
      toThickness,
      vertexThicknesses,
      segmentPenetration,
    );
    if (allRightSide) {
      negative(segmentPenetration, result);
      return index;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(segmentPenetration, result);
      resultLength = penetrationLength;
      resultIndex = index;
    }
  }

  {
    const [allRightSide, index] = getSidePolygonPenetration(
      to,
      from,
      toThickness,
      fromThickness,
      vertexThicknesses,
      segmentPenetration,
    );
    if (allRightSide) {
      negative(segmentPenetration, result);
      return index;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(segmentPenetration, result);
      resultIndex = index;
    }
  }
  return resultIndex;
}

const polygonPenetration = vec2();
const polygonPolygon0 = vec2();
const polygonPolygon1 = vec2();

function getPolygonPolygonPenetration(
  firstVertexThicknesses: VertexThicknesses,
  secondVertexThicknesses: VertexThicknesses,
  result: Vector2,
): number {
  const secondCount = secondVertexThicknesses.getVertexCount();
  if (secondCount === 1) {
    return getPolygonPointPenetration(
      firstVertexThicknesses,
      polygonPolygon0,
      secondVertexThicknesses.getVertexThickness(0, polygonPolygon0),
      result,
    );
  }
  if (secondCount === 2) {
    return getPolygonSegmentPenetration(
      firstVertexThicknesses,
      polygonPolygon0,
      polygonPolygon1,
      secondVertexThicknesses.getVertexThickness(0, polygonPolygon0),
      secondVertexThicknesses.getVertexThickness(1, polygonPolygon1),
      result,
    );
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
  let resultIndex = 0;
  const firstCount = firstVertexThicknesses.getVertexCount();
  for (let ii = 0; ii < firstCount; ii++) {
    const toIndex = (ii + 1) % firstCount;
    const [allRightSide, index] = getSidePolygonPenetration(
      polygonPolygon0,
      polygonPolygon1,
      firstVertexThicknesses.getVertexThickness(ii, polygonPolygon0),
      firstVertexThicknesses.getVertexThickness(toIndex, polygonPolygon1),
      secondVertexThicknesses,
      polygonPenetration,
    );
    if (allRightSide) {
      equals(polygonPenetration, result);
      return ii;
    }
    const penetrationLength = length(polygonPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(polygonPenetration, result);
      resultLength = penetrationLength;
      resultIndex = ii;
    }
  }

  for (let ii = 0; ii < secondCount; ii++) {
    const toIndex = (ii + 1) % secondCount;
    const [allRightSide, index] = getSidePolygonPenetration(
      polygonPolygon0,
      polygonPolygon1,
      secondVertexThicknesses.getVertexThickness(ii, polygonPolygon0),
      secondVertexThicknesses.getVertexThickness(toIndex, polygonPolygon1),
      firstVertexThicknesses,
      polygonPenetration,
    );
    if (allRightSide) {
      negative(polygonPenetration, result);
      return index;
    }
    const penetrationLength = length(polygonPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(polygonPenetration, result);
      resultLength = penetrationLength;
      resultIndex = index;
    }
  }
  return resultIndex;
}

const sidePenetration = vec2();

function getSideSegmentPenetration(
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  start: Vector2,
  end: Vector2,
  startThickness: number,
  endThickness: number,
  result: Vector2,
): boolean {
  const startRightSide = getSidePointPenetration(
    from,
    to,
    fromThickness,
    toThickness,
    start,
    startThickness,
    result,
  );
  const endRightSide = getSidePointPenetration(
    from,
    to,
    fromThickness,
    toThickness,
    end,
    endThickness,
    sidePenetration,
  );
  if (length(sidePenetration) > length(result)) {
    equals(sidePenetration, result);
  }
  return startRightSide && endRightSide;
}

const sidePolygonPoint = vec2();

function getSidePolygonPenetration(
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  vertexThicknesses: VertexThicknesses,
  result: Vector2,
): [boolean, number] {
  vec2(0.0, 0.0, result);
  let resultLength = 0.0;
  let resultIndex = 0;
  let allRightSide = true;
  const count = vertexThicknesses.getVertexCount();
  for (let ii = 0; ii < count; ii++) {
    const rightSide = getSidePointPenetration(
      from,
      to,
      fromThickness,
      toThickness,
      sidePolygonPoint,
      vertexThicknesses.getVertexThickness(ii, sidePolygonPoint),
      sidePenetration,
    );
    const penetrationLength = length(sidePenetration);
    if (penetrationLength > resultLength) {
      equals(sidePenetration, result);
      resultLength = penetrationLength;
      resultIndex = ii;
    }
    allRightSide = allRightSide && rightSide;
  }
  return [allRightSide, resultIndex];
}

const v1 = vec2();
const v2 = vec2();

function getSidePointPenetration(
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  point: Vector2,
  pointThickness: number,
  result: Vector2,
): boolean {
  minus(point, from, v1);
  minus(to, from, v2);
  const cp = cross(v1, v2);
  const squareLength = squareDistance(from, to);
  const dp = dot(v1, v2);
  if (dp <= 0.0) {
    if (cp < 0.0) {
      vec2(0.0, 0.0, result);
      return false;
    }
    minus(from, point, result);
    const oldLength = length(result);
    const newLength = fromThickness + pointThickness - oldLength;
    if (newLength <= 0.0) {
      vec2(0.0, 0.0, result);
    } else {
      if (oldLength === 0.0) {
        timesEquals(orthonormalizeEquals(minus(to, from, result)), newLength);
      } else {
        timesEquals(result, newLength / oldLength);
      }
    }
  } else if (dp >= squareLength) {
    if (cp < 0.0) {
      vec2(0.0, 0.0, result);
      return false;
    }
    minus(to, point, result);
    const oldLength = length(result);
    const newLength = toThickness + pointThickness - oldLength;
    if (newLength <= 0.0) {
      vec2(0.0, 0.0, result);
    } else {
      if (oldLength === 0.0) {
        timesEquals(orthonormalizeEquals(minus(to, from, result)), newLength);
      } else {
        timesEquals(result, newLength / oldLength);
      }
    }
  } else {
    const t = dp / squareLength;
    plusEquals(timesEquals(minus(to, from, result), t), from);
    minusEquals(result, point);
    const oldLength = length(result);
    const thickness = mix(fromThickness, toThickness, t);
    if (cp < 0.0) {
      const newLength = thickness + pointThickness + oldLength;
      timesEquals(orthonormalizeEquals(minus(to, from, result)), newLength);
      return false;
    }
    const newLength = thickness + pointThickness - oldLength;
    if (newLength <= 0.0) {
      vec2(0.0, 0.0, result);
    } else {
      timesEquals(orthonormalizeEquals(minus(to, from, result)), newLength);
    }
  }
  return true;
}

function getNearestPointOnSegment(
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  position: Vector2,
  result: Vector2,
): number {
  minus(position, from, v1);
  minus(to, from, v2);
  const squareLength = squareDistance(from, to);
  const dp = dot(v1, v2);
  if (dp <= 0.0) {
    equals(from, result);
    return fromThickness;
  } else if (dp >= squareLength) {
    equals(to, result);
    return toThickness;
  } else {
    const t = dp / squareLength;
    plusEquals(timesEquals(minus(to, from, result), t), from);
    return mix(fromThickness, toThickness, t);
  }
}
