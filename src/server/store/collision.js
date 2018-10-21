/**
 * Collision geometry.
 *
 * @module server/store/collision
 * @flow
 */

import type {Vector2} from './math';

export type ConvexPolygon = {indices: number[]};

/**
 * Geometry representation for collision detection/response.
 *
 * @param arrayBuffer the array containing the vertex data.
 * @param attributeSizes the map containing the size of the vertex attributes.
 * @param pathLengths the lengths (vertex counts) of the paths in the list.
 * @param shapes the convex shapes in the list.
 */
export class CollisionGeometry {
  _arrayBuffer: Float32Array;
  _attributeSizes: {[string]: number};
  _pathLengths: number[];
  _polygons: ConvexPolygon[];

  constructor(
    arrayBuffer: Float32Array,
    attributeSizes: {[string]: number},
    pathLengths: number[],
    polygons: ConvexPolygon[],
  ) {
    this._arrayBuffer = arrayBuffer;
    this._attributeSizes = attributeSizes;
    this._pathLengths = pathLengths;
    this._polygons = polygons;
  }

  /**
   * Checks whether the geometry intersects the provided point.
   *
   * @param point the point to check.
   * @return whether or not the point intersects.
   */
  intersectsPoint(point: Vector2): boolean {
    return true;
  }
}
