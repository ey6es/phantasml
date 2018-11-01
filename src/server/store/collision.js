/**
 * Collision geometry.
 *
 * @module server/store/collision
 * @flow
 */

import type {Vector2, Transform} from './math';
import {
  getTransformMatrix,
  vec2,
  equals,
  negative,
  negativeEquals,
  minus,
  minusEquals,
  plusEquals,
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

export type CollisionPath = {
  firstIndex: number,
  lastIndex: number,
  loop: boolean,
};

export type CollisionPolygon = {indices: number[]};

const penetration = vec2();
const otherPenetration = vec2();
const vertex = vec2();
const from = vec2();
const to = vec2();
const featurePenetration = vec2();
const point = vec2();
const begin = vec2();
const finish = vec2();

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
   * Finds the position of the feature (vertex, edge) nearest to the position
   * provided.
   *
   * @param position the position to compare against.
   * @param radius the radius to use in the comparison.
   * @return the position of the nearest feature, if any.
   */
  getNearestFeaturePosition(position: Vector2, radius: number): ?Vector2 {
    let closestPoint = vec2();
    let closestDistance = radius;
    for (const path of this._paths) {
      const finalIndex = path.lastIndex - 1;
      if (path.firstIndex === finalIndex) {
        const vertexThickness = this._getVertexThickness(finalIndex, vertex);
        const dist = distance(vertex, position) - vertexThickness;
        if (dist < closestDistance) {
          equals(vertex, closestPoint);
          closestDistance = dist;
        }
        continue;
      }
      const endIndex = path.loop ? path.lastIndex : finalIndex;
      for (let fromIndex = path.firstIndex; fromIndex < endIndex; fromIndex++) {
        const toIndex =
          fromIndex === finalIndex ? path.firstIndex : fromIndex + 1;
        const fromThickness = this._getVertexThickness(fromIndex, from);
        const toThickness = this._getVertexThickness(toIndex, to);
        const vertexThickness = getNearestPointOnSegment(
          from,
          to,
          fromThickness,
          toThickness,
          position,
          vertex,
        );
        const dist = distance(vertex, position) - vertexThickness;
        if (dist < closestDistance) {
          equals(vertex, closestPoint);
          closestDistance = dist;
        }
      }
    }
    for (const polygon of this._polygons) {
      for (let ii = 0; ii < polygon.indices.length; ii++) {
        const fromIndex = polygon.indices[ii];
        const toIndex = polygon.indices[(ii + 1) % polygon.indices.length];
        const fromThickness = this._getVertexThickness(fromIndex, from);
        const toThickness = this._getVertexThickness(toIndex, to);
        const vertexThickness = getNearestPointOnSegment(
          from,
          to,
          fromThickness,
          toThickness,
          position,
          vertex,
        );
        const dist = distance(vertex, position) - vertexThickness;
        if (dist < closestDistance) {
          equals(vertex, closestPoint);
          closestDistance = dist;
        }
      }
    }
    return closestDistance < radius ? closestPoint : null;
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
   */
  getPenetration(
    other: CollisionGeometry,
    transform: Transform,
    radius: number,
    result: Vector2,
  ) {
    vec2(0.0, 0.0, result);
    let resultLength = 0.0;

    const matrix = getTransformMatrix(transform);
    for (const path of this._paths) {
      const finalIndex = path.lastIndex - 1;
      if (path.firstIndex === finalIndex) {
        const vertexThickness = this._getVertexThickness(finalIndex, vertex);
        other.getPointPenetration(
          transformPointEquals(vertex, matrix),
          vertexThickness,
          otherPenetration,
        );
        const penetrationLength = length(otherPenetration);
        if (penetrationLength > resultLength) {
          negative(otherPenetration, result);
          resultLength = penetrationLength;
        }
        continue;
      }
      const endIndex = path.loop ? path.lastIndex : finalIndex;
      for (let fromIndex = path.firstIndex; fromIndex < endIndex; fromIndex++) {
        const toIndex =
          fromIndex === finalIndex ? path.firstIndex : fromIndex + 1;
        const fromThickness = this._getVertexThickness(fromIndex, from);
        const toThickness = this._getVertexThickness(toIndex, to);
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
      }
    }
    for (const polygon of this._polygons) {
      const vertices: Vector2[] = [];
      const vertexThicknesses: number[] = [];
      for (const index of polygon.indices) {
        const vertex = vec2();
        vertexThicknesses.push(
          this._getVertexThickness(index, vertex) + radius,
        );
        vertices.push(transformPointEquals(vertex, matrix));
      }
      other.getPolygonPenetration(
        vertices,
        vertexThicknesses,
        otherPenetration,
      );
      const penetrationLength = length(otherPenetration);
      if (penetrationLength > resultLength) {
        negative(otherPenetration, result);
        resultLength = penetrationLength;
      }
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
   */
  getPointPenetration(
    vertex: Vector2,
    vertexThickness: number,
    result: Vector2,
  ) {
    vec2(0.0, 0.0, result);
    let resultLength = 0.0;

    for (const path of this._paths) {
      const finalIndex = path.lastIndex - 1;
      if (path.firstIndex === finalIndex) {
        const pointThickness = this._getVertexThickness(finalIndex, point);
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
        continue;
      }
      const endIndex = path.loop ? path.lastIndex : finalIndex;
      for (let fromIndex = path.firstIndex; fromIndex < endIndex; fromIndex++) {
        const toIndex =
          fromIndex === finalIndex ? path.firstIndex : fromIndex + 1;
        const beginThickness = this._getVertexThickness(fromIndex, begin);
        const finishThickness = this._getVertexThickness(toIndex, finish);
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
      }
    }
    for (const polygon of this._polygons) {
      const vertices: Vector2[] = [];
      const vertexThicknesses: number[] = [];
      for (const index of polygon.indices) {
        const vertex = vec2();
        vertices.push(vertex);
        vertexThicknesses.push(this._getVertexThickness(index, vertex));
      }
      getPolygonPointPenetration(
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
    let resultLength = 0.0;

    for (const path of this._paths) {
      const finalIndex = path.lastIndex - 1;
      if (path.firstIndex === finalIndex) {
        const pointThickness = this._getVertexThickness(finalIndex, point);
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
        continue;
      }
      const endIndex = path.loop ? path.lastIndex : finalIndex;
      for (let fromIndex = path.firstIndex; fromIndex < endIndex; fromIndex++) {
        const toIndex =
          fromIndex === finalIndex ? path.firstIndex : fromIndex + 1;
        const beginThickness = this._getVertexThickness(fromIndex, begin);
        const finishThickness = this._getVertexThickness(toIndex, finish);
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
    for (const polygon of this._polygons) {
      const vertices: Vector2[] = [];
      const vertexThicknesses: number[] = [];
      for (const index of polygon.indices) {
        const vertex = vec2();
        vertices.push(vertex);
        vertexThicknesses.push(this._getVertexThickness(index, vertex));
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
   */
  getPolygonPenetration(
    points: Vector2[],
    thicknesses: number[],
    result: Vector2,
  ) {
    vec2(0.0, 0.0, result);
    let resultLength = 0.0;

    for (const path of this._paths) {
      const finalIndex = path.lastIndex - 1;
      if (path.firstIndex === finalIndex) {
        const pointThickness = this._getVertexThickness(finalIndex, point);
        getPolygonPointPenetration(
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
        }
        continue;
      }
      const endIndex = path.loop ? path.lastIndex : finalIndex;
      for (let fromIndex = path.firstIndex; fromIndex < endIndex; fromIndex++) {
        const toIndex =
          fromIndex === finalIndex ? path.firstIndex : fromIndex + 1;
        const beginThickness = this._getVertexThickness(fromIndex, begin);
        const finishThickness = this._getVertexThickness(toIndex, finish);
        getPolygonSegmentPenetration(
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
        }
      }
    }
    for (const polygon of this._polygons) {
      const vertices: Vector2[] = [];
      const vertexThicknesses: number[] = [];
      for (const index of polygon.indices) {
        const vertex = vec2();
        vertices.push(vertex);
        vertexThicknesses.push(this._getVertexThickness(index, vertex));
      }
      getPolygonPolygonPenetration(
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
      }
    }
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

function getPointPointPenetration(
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
) {
  if (points.length === 1) {
    getPointPointPenetration(
      points[0],
      thicknesses[0] || 0.0,
      vertex,
      vertexThickness,
      result,
    );
    return;
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
    return;
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
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
      return;
    }
    const penetrationLength = length(pointPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(pointPenetration, result);
      resultLength = penetrationLength;
    }
  }
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
) {
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
    return;
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
    return;
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
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
      return;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(segmentPenetration, result);
      resultLength = penetrationLength;
    }
  }

  {
    const allRightSide = getSidePolygonPenetration(
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
      return;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(segmentPenetration, result);
      resultLength = penetrationLength;
    }
  }

  {
    const allRightSide = getSidePolygonPenetration(
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
      return;
    }
    const penetrationLength = length(segmentPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(segmentPenetration, result);
    }
  }
}

const polygonPenetration = vec2();

function getPolygonPolygonPenetration(
  firstPoints: Vector2[],
  firstThicknesses: number[],
  secondPoints: Vector2[],
  secondThicknesses: number[],
  result: Vector2,
) {
  if (secondPoints.length === 1) {
    getPolygonPointPenetration(
      firstPoints,
      firstThicknesses,
      secondPoints[0],
      secondThicknesses[0] || 0.0,
      result,
    );
    return;
  }
  if (secondPoints.length === 2) {
    getPolygonSegmentPenetration(
      firstPoints,
      firstThicknesses,
      secondPoints[0],
      secondPoints[1],
      secondThicknesses[0] || 0.0,
      secondThicknesses[1] || 0.0,
      result,
    );
    return;
  }
  vec2(0.0, 0.0, result);
  let resultLength = Infinity;
  for (let ii = 0; ii < firstPoints.length; ii++) {
    const toIndex = (ii + 1) % firstPoints.length;
    const allRightSide = getSidePolygonPenetration(
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
      return;
    }
    const penetrationLength = length(polygonPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      equals(polygonPenetration, result);
      resultLength = penetrationLength;
    }
  }

  for (let ii = 0; ii < secondPoints.length; ii++) {
    const toIndex = (ii + 1) % secondPoints.length;
    const allRightSide = getSidePolygonPenetration(
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
      return;
    }
    const penetrationLength = length(polygonPenetration);
    if (penetrationLength > 0.0 && penetrationLength < resultLength) {
      negative(polygonPenetration, result);
      resultLength = penetrationLength;
    }
  }
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
): boolean {
  vec2(0.0, 0.0, result);
  let resultLength = 0.0;
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
    }
    allRightSide = allRightSide && rightSide;
  }
  return allRightSide;
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
