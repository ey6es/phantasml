/**
 * Collision geometry.
 *
 * @module server/store/collision
 * @flow
 */

import type {Vector2, Transform, Bounds} from './math';
import {
  getTransformMatrix,
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

/**
 * Base class for collision elements (paths, polygons).
 *
 * @param bounds the bounds of the element.
 */
export class CollisionElement {
  _bounds: Bounds;

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
   * @param points the points of the polygon in CCW winding order.
   * @param thicknesses the thicknesses associated with each point, if any.
   * @param result a vector to hold the result.
   * @param resultIndex the index of the current penetrated side.
   * @return the index of the penetrated side, if any.
   */
  getPolygonPenetration(
    geometry: CollisionGeometry,
    points: Vector2[],
    thicknesses: number[],
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
    points: Vector2[],
    thicknesses: number[],
    result: Vector2,
    resultIndex: number,
  ): number {
    let resultLength = length(result);
    const finalIndex = this._lastIndex - 1;
    if (this._firstIndex === finalIndex) {
      const pointThickness = geometry._getVertexThickness(finalIndex, point);
      const index = getPolygonPointPenetration(
        points,
        thicknesses,
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
        points,
        thicknesses,
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
    const matrix = getTransformMatrix(transform);
    let resultLength = length(result);
    const vertices: Vector2[] = [];
    const vertexThicknesses: number[] = [];
    for (const index of this._indices) {
      const vertex = vec2();
      vertexThicknesses.push(
        geometry._getVertexThickness(index, vertex) + radius,
      );
      vertices.push(transformPointEquals(vertex, matrix));
    }
    const index = other.getPolygonPenetration(
      vertices,
      vertexThicknesses,
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
    const vertices: Vector2[] = [];
    const vertexThicknesses: number[] = [];
    for (const index of this._indices) {
      const vertex = vec2();
      vertices.push(vertex);
      vertexThicknesses.push(geometry._getVertexThickness(index, vertex));
    }
    const index = getPolygonPointPenetration(
      vertices,
      vertexThicknesses,
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
    const vertices: Vector2[] = [];
    const vertexThicknesses: number[] = [];
    for (const index of this._indices) {
      const vertex = vec2();
      vertices.push(vertex);
      vertexThicknesses.push(geometry._getVertexThickness(index, vertex));
    }
    getPolygonSegmentPenetration(
      vertices,
      vertexThicknesses,
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
    points: Vector2[],
    thicknesses: number[],
    result: Vector2,
    resultIndex: number,
  ): number {
    let resultLength = length(result);
    const vertices: Vector2[] = [];
    const vertexThicknesses: number[] = [];
    for (const index of this._indices) {
      const vertex = vec2();
      vertices.push(vertex);
      vertexThicknesses.push(geometry._getVertexThickness(index, vertex));
    }
    const index = getPolygonPolygonPenetration(
      vertices,
      vertexThicknesses,
      points,
      thicknesses,
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
  _adjacentIndices: Map<number, number>;
  _area: ?number;
  _centerOfMass: ?Vector2;
  _momentOfInertia: ?number;

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
    this._elements = elements;
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
    let nearest: ?Vector2;
    for (const element of this._elements) {
      nearest = element.getNearestFeaturePosition(
        this,
        position,
        radius,
        nearest,
      );
    }
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
    vec2(0.0, 0.0, result);
    for (const element of this._elements) {
      element.getPenetration(
        this,
        other,
        transform,
        radius,
        result,
        allResults,
      );
    }
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
    vec2(0.0, 0.0, result);
    for (const element of this._elements) {
      element.getPointPenetration(
        this,
        vertex,
        vertexThickness,
        result,
        allResults,
      );
    }
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
    vec2(0.0, 0.0, result);
    for (const element of this._elements) {
      element.getSegmentPenetration(
        this,
        start,
        end,
        startThickness,
        endThickness,
        result,
      );
    }
  }

  /**
   * Checks the geometry for intersection with a polygon.
   *
   * @param points the points of the polygon in CCW winding order.
   * @param [thicknesses=[]] the thicknesses associated with each point, if any.
   * @return whether or not the polygon intersects.
   */
  intersectsPolygon(points: Vector2[], thicknesses: number[] = []): boolean {
    this.getPolygonPenetration(points, thicknesses, penetration);
    return length(penetration) > 0.0;
  }

  /**
   * Finds the penetration of a polygon into the geometry.
   *
   * @param points the points of the polygon in CCW winding order.
   * @param thicknesses the thicknesses associated with each point, if any.
   * @param result a vector to hold the result.
   * @return the index of the penetrated side, if any.
   */
  getPolygonPenetration(
    points: Vector2[],
    thicknesses: number[],
    result: Vector2,
  ): number {
    vec2(0.0, 0.0, result);
    let resultIndex = 0;
    for (const element of this._elements) {
      resultIndex = element.getPolygonPenetration(
        this,
        points,
        thicknesses,
        result,
        resultIndex,
      );
    }
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
    for (const element of this._elements) {
      totalArea += element._computeAreaAndCenterOfMass(
        this,
        centerOfMass,
        addQuad,
      );
    }
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
    for (const element of this._elements) {
      momentOfInertia += element._computeMomentOfInertia(this, addQuad);
    }
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

function getPolygonPointPenetration(
  points: Vector2[],
  thicknesses: number[],
  vertex: Vector2,
  vertexThickness: number,
  result: Vector2,
): number {
  if (points.length === 1) {
    getPointPointPenetration(
      points[0],
      thicknesses[0] || 0.0,
      vertex,
      vertexThickness,
      result,
    );
    return 0;
  }
  if (points.length === 2) {
    getSegmentPointPenetration(
      points[0],
      points[1],
      thicknesses[0] || 0.0,
      thicknesses[1] || 0.0,
      vertex,
      vertexThickness,
      result,
    );
    return 0;
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
  let resultIndex = 0;
  for (let ii = 0; ii < points.length; ii++) {
    const toIndex = (ii + 1) % points.length;
    const rightSide = getSidePointPenetration(
      points[ii],
      points[toIndex],
      thicknesses[ii] || 0.0,
      thicknesses[toIndex] || 0.0,
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

function getPolygonSegmentPenetration(
  points: Vector2[],
  thicknesses: number[],
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  result: Vector2,
): number {
  if (points.length === 1) {
    getSegmentPointPenetration(
      from,
      to,
      fromThickness,
      toThickness,
      points[0],
      thicknesses[0] || 0.0,
      result,
    );
    negativeEquals(result);
    return 0;
  }
  if (points.length === 2) {
    getSegmentSegmentPenetration(
      points[0],
      points[1],
      thicknesses[0] || 0.0,
      thicknesses[1] || 0.0,
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
  for (let ii = 0; ii < points.length; ii++) {
    const toIndex = (ii + 1) % points.length;
    const allRightSide = getSideSegmentPenetration(
      points[ii],
      points[toIndex],
      thicknesses[ii] || 0.0,
      thicknesses[toIndex] || 0.0,
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
      points,
      thicknesses,
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
      points,
      thicknesses,
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

function getPolygonPolygonPenetration(
  firstPoints: Vector2[],
  firstThicknesses: number[],
  secondPoints: Vector2[],
  secondThicknesses: number[],
  result: Vector2,
): number {
  if (secondPoints.length === 1) {
    return getPolygonPointPenetration(
      firstPoints,
      firstThicknesses,
      secondPoints[0],
      secondThicknesses[0] || 0.0,
      result,
    );
  }
  if (secondPoints.length === 2) {
    return getPolygonSegmentPenetration(
      firstPoints,
      firstThicknesses,
      secondPoints[0],
      secondPoints[1],
      secondThicknesses[0] || 0.0,
      secondThicknesses[1] || 0.0,
      result,
    );
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
  let resultIndex = 0;
  for (let ii = 0; ii < firstPoints.length; ii++) {
    const toIndex = (ii + 1) % firstPoints.length;
    const [allRightSide, index] = getSidePolygonPenetration(
      firstPoints[ii],
      firstPoints[toIndex],
      firstThicknesses[ii] || 0.0,
      firstThicknesses[toIndex] || 0.0,
      secondPoints,
      secondThicknesses,
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

  for (let ii = 0; ii < secondPoints.length; ii++) {
    const toIndex = (ii + 1) % secondPoints.length;
    const [allRightSide, index] = getSidePolygonPenetration(
      secondPoints[ii],
      secondPoints[toIndex],
      secondThicknesses[ii] || 0.0,
      secondThicknesses[toIndex] || 0.0,
      firstPoints,
      firstThicknesses,
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

function getSidePolygonPenetration(
  from: Vector2,
  to: Vector2,
  fromThickness: number,
  toThickness: number,
  points: Vector2[],
  thicknesses: number[],
  result: Vector2,
): [boolean, number] {
  vec2(0.0, 0.0, result);
  let resultLength = 0.0;
  let resultIndex = 0;
  let allRightSide = true;
  for (let ii = 0; ii < points.length; ii++) {
    const rightSide = getSidePointPenetration(
      from,
      to,
      fromThickness,
      toThickness,
      points[ii],
      thicknesses[ii] || 0.0,
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
