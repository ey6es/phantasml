/**
 * Collision geometry.
 *
 * @module server/store/collision
 * @flow
 */

import type {Vector2, Plane} from './math';
import {
  vec2,
  minus,
  plus,
  times,
  distance,
  squareDistance,
  orthonormalizeEquals,
  dot,
  cross,
  planeFromPoints,
  signedDistance,
  mix,
} from './math';

export type CollisionPath = {
  firstIndex: number,
  lastIndex: number,
  loop: boolean,
};

export type CollisionPolygon = {indices: number[]};

const vertex = vec2();
const from = vec2();
const to = vec2();
const v1 = vec2();
const v2 = vec2();
const plane = {normal: vec2(), constant: 0.0};
const leftPlane = {normal: vec2(), constant: 0.0};
const rightPlane = {normal: vec2(), constant: 0.0};

/**
 * Geometry representation for collision detection/response.
 *
 * @param arrayBuffer the array containing the vertex data.
 * @param attributeSizes the map containing the size of the vertex attributes.
 * @param paths the paths in the list.
 * @param polygons the (convex) polygons in the list.
 */
export class CollisionGeometry {
  _arrayBuffer: Float32Array;
  _attributeOffsets: {[string]: number};
  _vertexSize: number;
  _paths: CollisionPath[];
  _polygons: CollisionPolygon[];

  constructor(
    arrayBuffer: Float32Array,
    attributeSizes: {[string]: number},
    paths: CollisionPath[],
    polygons: CollisionPolygon[],
  ) {
    this._arrayBuffer = arrayBuffer;
    this._attributeOffsets = {};
    let currentOffset = 0;
    for (const name in attributeSizes) {
      this._attributeOffsets[name] = currentOffset;
      currentOffset += attributeSizes[name];
    }
    this._vertexSize = currentOffset;
    this._paths = paths;
    this._polygons = polygons;
  }

  /**
   * Checks whether the geometry intersects the provided point.
   *
   * @param point the point to check.
   * @return whether or not the point intersects.
   */
  intersectsPoint(point: Vector2): boolean {
    for (const path of this._paths) {
      if (path.lastIndex === path.firstIndex + 1) {
        // single point path
        const thickness = this._getVertexThickness(path.firstIndex, vertex);
        if (distance(point, vertex) <= thickness) {
          return true;
        }
        continue;
      }
      const finalIndex = path.lastIndex - 1;
      const endIndex = path.loop ? path.lastIndex : finalIndex;
      for (let fromIndex = path.firstIndex; fromIndex < endIndex; fromIndex++) {
        const toIndex =
          fromIndex === finalIndex ? path.firstIndex : fromIndex + 1;
        const fromThickness = this._getVertexThickness(fromIndex, from);
        const toThickness = this._getVertexThickness(toIndex, to);
        const squareLength = squareDistance(from, to);
        minus(point, from, v1);
        minus(to, from, v2);
        const dp = dot(v1, v2);
        if (dp <= 0.0) {
          if (distance(point, from) <= fromThickness) {
            return true;
          }
        } else if (dp >= squareLength) {
          if (distance(point, to) <= toThickness) {
            return true;
          }
        } else {
          const t = dp / squareLength;
          const thickness = mix(fromThickness, toThickness, t);
          if (Math.abs(cross(v1, v2)) <= thickness * Math.sqrt(squareLength)) {
            return true;
          }
        }
      }
    }
    polygonLoop: for (const polygon of this._polygons) {
      for (let ii = 0; ii < polygon.indices.length; ii++) {
        const fromIndex = polygon.indices[ii];
        const toIndex = polygon.indices[(ii + 1) % polygon.indices.length];
        const fromThickness = this._getVertexThickness(fromIndex, from);
        const toThickness = this._getVertexThickness(toIndex, to);
        minus(point, from, v1);
        minus(to, from, v2);
        const cp = cross(v1, v2);
        if (cp >= 0.0) {
          const squareLength = squareDistance(from, to);
          const dp = dot(v1, v2);
          if (dp <= 0.0) {
            if (distance(point, from) <= fromThickness) {
              return true;
            }
          } else if (dp >= squareLength) {
            if (distance(point, to) <= toThickness) {
              return true;
            }
          } else {
            const t = dp / squareLength;
            const thickness = mix(fromThickness, toThickness, t);
            if (cp <= thickness * Math.sqrt(squareLength)) {
              return true;
            }
          }
          continue polygonLoop;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Checks whether the geometry intersects the provided convex polygon.
   *
   * @param points the points comprising the polygon.
   * @return whether or not the point intersects.
   */
  intersectsConvexPolygon(points: Vector2[]): boolean {
    for (const path of this._paths) {
      if (path.lastIndex === path.firstIndex + 1) {
        // single point path
        const thickness = this._getVertexThickness(path.firstIndex, vertex);
        if (getPolygonDistance(points, vertex) <= thickness) {
          return true;
        }
        continue;
      }
      const finalIndex = path.lastIndex - 1;
      const endIndex = path.loop ? path.lastIndex : finalIndex;
      divisionLoop: for (
        let fromIndex = path.firstIndex;
        fromIndex < endIndex;
        fromIndex++
      ) {
        const toIndex =
          fromIndex === finalIndex ? path.firstIndex : fromIndex + 1;
        const fromThickness = this._getVertexThickness(fromIndex, from);
        const toThickness = this._getVertexThickness(toIndex, to);
        getOffsetPlane(from, fromThickness, to, toThickness, rightPlane);
        getOffsetPlane(to, toThickness, from, fromThickness, leftPlane);

        let maxRightDistance = -Infinity;
        let maxLeftDistance = -Infinity;
        for (let ii = 0; ii < points.length; ii++) {
          const start = points[ii];
          maxRightDistance = Math.max(
            maxRightDistance,
            signedDistance(rightPlane, start),
          );
          maxLeftDistance = Math.max(
            maxLeftDistance,
            signedDistance(leftPlane, start),
          );
          const end = points[(ii + 1) % points.length];
          planeFromPoints(start, end, plane);

          const maxDistance = Math.max(
            signedDistance(plane, from) + fromThickness,
            signedDistance(plane, to) + toThickness,
          );
          if (maxDistance < 0.0) {
            continue divisionLoop;
          }
        }
        if (maxRightDistance < 0.0 || maxLeftDistance < 0.0) {
          continue divisionLoop;
        }
        return true;
      }
    }
    polygonLoop: for (const polygon of this._polygons) {
      for (let ii = 0; ii < polygon.indices.length; ii++) {
        const fromIndex = polygon.indices[ii];
        const toIndex = polygon.indices[(ii + 1) % polygon.indices.length];
        const fromThickness = this._getVertexThickness(fromIndex, from);
        const toThickness = this._getVertexThickness(toIndex, to);
        getOffsetPlane(from, fromThickness, to, toThickness, plane);

        let maxDistance = -Infinity;
        for (let jj = 0; jj < points.length; jj++) {
          maxDistance = Math.max(
            maxDistance,
            signedDistance(plane, points[jj]),
          );
        }
        if (maxDistance < 0.0) {
          continue polygonLoop;
        }
      }
      for (let ii = 0; ii < points.length; ii++) {
        const start = points[ii];
        const end = points[(ii + 1) % points.length];
        planeFromPoints(start, end, plane);

        let maxDistance = -Infinity;
        for (let jj = 0; jj < polygon.indices.length; jj++) {
          const thickness = this._getVertexThickness(
            polygon.indices[jj],
            vertex,
          );
          maxDistance = Math.max(
            maxDistance,
            signedDistance(plane, vertex) + thickness,
          );
        }
        if (maxDistance < 0.0) {
          continue polygonLoop;
        }
      }
      return true;
    }
    return false;
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

function getPolygonDistance(points: Vector2[], vertex: Vector2): number {
  for (let ii = 0; ii < points.length; ii++) {
    const from = points[ii];
    const to = points[(ii + 1) % points.length];
    minus(vertex, from, v1);
    minus(to, from, v2);
    const cp = cross(v1, v2);
    if (cp >= 0.0) {
      const squareLength = squareDistance(from, to);
      const dp = dot(v1, v2);
      if (dp <= 0.0) {
        return distance(vertex, from);
      } else if (dp >= squareLength) {
        return distance(vertex, to);
      } else {
        return cp / Math.sqrt(squareLength);
      }
    }
  }
  return 0.0;
}

const p1 = vec2();
const p2 = vec2();
const normal = vec2();
const vector = vec2();

function getOffsetPlane(
  from: Vector2,
  fromThickness: number,
  to: Vector2,
  toThickness: number,
  result?: Plane,
): Plane {
  orthonormalizeEquals(minus(to, from, normal));
  plus(from, times(normal, -fromThickness, vector), p1);
  plus(to, times(normal, -toThickness, vector), p2);
  return planeFromPoints(p1, p2, result);
}
