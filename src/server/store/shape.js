/**
 * Shape renderer.
 *
 * @module client/renderer/shape
 * @flow
 */

import type {Vector2, Plane} from './math';
import {
  radians,
  distance,
  clamp,
  vec2,
  equals,
  plus,
  plusEquals,
  minus,
  minusEquals,
  times,
  timesEquals,
  orthonormalize,
  orthonormalizeEquals,
  dot,
  cross,
  planeFromPoints,
  planeFromPointNormal,
  invert,
  equalsPlane,
  signedDistance,
  mix,
} from './math';

type VertexAttributes = {[string]: number | number[]};

type GeometryGroup = {start: number, end: number, zOrder: number};

type GeometryStats = {
  attributeSizes: {[string]: number},
  vertices: number,
  indices: number,
  groups: GeometryGroup[],
};

/**
 * A general representation of a path.
 *
 * @param [loop=false] whether or not the path represents a loop.
 */
class Path {
  loop: boolean;
  commands: PathCommand[] = [];

  /** Returns the z order of the last path command. */
  get zOrder(): number {
    const lastIndex = this.commands.length - 1;
    return lastIndex < 0 ? 0 : this.commands[lastIndex].zOrder;
  }

  constructor(loop: boolean = false) {
    this.loop = loop;
  }

  /**
   * Adds a command to move to a destination point.
   *
   * @param dest the point to move to.
   * @param [zOrder=0] z order to use.
   * @param [attributes] optional additional vertex attributes.
   * @return a reference to this path, for chaining.
   */
  moveTo(
    dest: Vector2,
    zOrder: number = 0,
    attributes?: VertexAttributes,
  ): Path {
    this.commands.push(new MoveTo(dest, zOrder, attributes));
    return this;
  }

  /**
   * Adds a command to draw a line to a destination point.
   *
   * @param dest the point to draw to.
   * @param [attributes] optional additional vertex attributes.
   * @param [zOrder=0] z order to use for the line.
   * @return a reference to this path, for chaining.
   */
  lineTo(
    dest: Vector2,
    zOrder: number = 0,
    attributes?: VertexAttributes,
  ): Path {
    this._ensureStartPosition(zOrder, attributes);
    this.commands.push(new LineTo(dest, zOrder, attributes));
    return this;
  }

  /**
   * Adds a command to draw an arc to a destination point.
   *
   * @param dest the point to draw to.
   * @param radius the signed radius of the arc (a negative value indicates
   * a left rather than right turn).
   * @param [zOrder=0] z order to use for the arc.
   * @param [attributes] optional additional vertex attributes.
   * @return a reference to this path, for chaining.
   */
  arcTo(
    dest: Vector2,
    radius: number,
    zOrder: number = 0,
    attributes?: VertexAttributes,
  ): Path {
    this._ensureStartPosition(zOrder, attributes);
    this.commands.push(new ArcTo(dest, radius, zOrder, attributes));
    return this;
  }

  /**
   * Adds a command to draw a cubic Bezier curve to a destination point.
   *
   * @param dest the point to draw to.
   * @param c1 the first internal control point.
   * @param c2 the second internal control point.
   * @param [zOrder=0] z order to use for the curve.
   * @param [attributes] optional additional vertex attributes.
   * @return a reference to this path, for chaining.
   */
  curveTo(
    dest: Vector2,
    c1: Vector2,
    c2: Vector2,
    zOrder: number = 0,
    attributes?: VertexAttributes,
  ): Path {
    this._ensureStartPosition(zOrder, attributes);
    this.commands.push(new CurveTo(dest, c1, c2, zOrder, attributes));
    return this;
  }

  _ensureStartPosition(zOrder: number, attributes: ?VertexAttributes) {
    if (this.commands.length === 0) {
      this.commands.push(new MoveTo({x: 0.0, y: 0.0}, zOrder, attributes));
    }
  }

  updateStats(stats: GeometryStats, tessellation: number) {
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previous: ?PathCommand;
      if (this.loop) {
        const lastIndex = this.commands.length - 1;
        previous = this.commands[(ii + lastIndex) % this.commands.length];
      } else {
        previous = this.commands[ii - 1];
      }
      command.updateStats(stats, tessellation, previous);
    }
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    groups: GeometryGroup[],
    groupIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    edge: boolean,
  ): [number, number] {
    // get the stats for this path only
    const stats: GeometryStats = {
      attributeSizes: {vertex: 2, plane: 3},
      vertices: 0,
      indices: 0,
      groups: [],
    };
    this.updateStats(stats, tessellation);
    const vertexCount = stats.vertices;

    // start with just the vertices/attributes
    const firstArrayIndex = arrayIndex;
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previous: ?PathCommand;
      if (this.loop) {
        const lastIndex = this.commands.length - 1;
        previous = this.commands[(ii + lastIndex) % this.commands.length];
      } else {
        previous = this.commands[ii - 1];
      }
      [arrayIndex, groupIndex] = command.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        groups,
        groupIndex,
        attributeOffsets,
        vertexSize,
        vertexCount,
        tessellation,
        this.loop,
        edge,
        firstArrayIndex,
        previous,
      );
    }
    // fill in the plane attributes now that we have all vertices
    const vertexSpan = 6;
    const maxVertex = vertexCount - 1;
    const firstVertex = firstArrayIndex / vertexSize;
    const from = vec2();
    const to = vec2();
    const previous = vec2();
    const next = vec2();
    const toPrevious = vec2();
    const toFromPlane = {normal: vec2(), constant: 0.0};
    const toPreviousPlane = {normal: vec2(), constant: 0.0};
    for (
      let vertexOffset = 0;
      vertexOffset < vertexCount;
      vertexOffset += vertexSpan
    ) {
      const offsetVertex = firstVertex + vertexOffset;

      const fromIndex = offsetVertex * vertexSize + attributeOffsets.vertex;
      vec2(arrayBuffer[fromIndex], arrayBuffer[fromIndex + 1], from);

      const toIndex =
        (offsetVertex + vertexSpan - 1) * vertexSize + attributeOffsets.vertex;
      vec2(arrayBuffer[toIndex], arrayBuffer[toIndex + 1], to);

      planeFromPoints(to, from, toFromPlane);

      let previousIndex = vertexOffset - vertexSpan;
      if (this.loop) {
        previousIndex = (previousIndex + vertexCount) % vertexCount;
      } else {
        previousIndex = Math.max(0, previousIndex);
      }
      previousIndex =
        (firstVertex + previousIndex) * vertexSize + attributeOffsets.vertex;
      vec2(
        arrayBuffer[previousIndex],
        arrayBuffer[previousIndex + 1],
        previous,
      );

      minus(previous, to, toPrevious);
      planeFromPointNormal(
        from,
        orthonormalizeEquals(toPrevious),
        toPreviousPlane,
      );

      let planeIndex = offsetVertex * vertexSize + attributeOffsets.plane;
      arrayBuffer[planeIndex] = toPreviousPlane.normal.x;
      arrayBuffer[planeIndex + 1] = toPreviousPlane.normal.y;
      arrayBuffer[planeIndex + 2] = toPreviousPlane.constant;

      planeIndex += vertexSize;
      arrayBuffer[planeIndex] = -toPreviousPlane.normal.x;
      arrayBuffer[planeIndex + 1] = -toPreviousPlane.normal.y;
      arrayBuffer[planeIndex + 2] = -toPreviousPlane.constant;

      planeIndex += vertexSize;
      arrayBuffer[planeIndex] = toFromPlane.normal.x;
      arrayBuffer[planeIndex + 1] = toFromPlane.normal.y;
      arrayBuffer[planeIndex + 2] = toFromPlane.constant;

      planeIndex += vertexSize;
      arrayBuffer[planeIndex] = -toFromPlane.normal.x;
      arrayBuffer[planeIndex + 1] = -toFromPlane.normal.y;
      arrayBuffer[planeIndex + 2] = -toFromPlane.constant;

      planeIndex += vertexSize;
      arrayBuffer[planeIndex] = toFromPlane.normal.x;
      arrayBuffer[planeIndex + 1] = toFromPlane.normal.y;
      arrayBuffer[planeIndex + 2] = toFromPlane.constant;

      planeIndex += vertexSize;
      arrayBuffer[planeIndex] = -toFromPlane.normal.x;
      arrayBuffer[planeIndex + 1] = -toFromPlane.normal.y;
      arrayBuffer[planeIndex + 2] = -toFromPlane.constant;
    }
    return [arrayIndex, groupIndex];
  }
}

class PathCommand {
  dest: Vector2;
  zOrder: number;
  attributes: ?VertexAttributes;

  constructor(dest: Vector2, zOrder: number, attributes: ?VertexAttributes) {
    this.dest = dest;
    this.zOrder = zOrder;
    this.attributes = attributes;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
  ) {
    if (this.attributes) {
      for (const name in this.attributes) {
        const value = this.attributes[name];
        const length = Array.isArray(value) ? value.length : 1;
        if (!(length <= stats.attributeSizes[name])) {
          stats.attributeSizes[name] = length;
        }
      }
    }
  }

  _addToStats(stats: GeometryStats, divisions: number) {
    stats.vertices += this._getVerticesForDivisions(divisions);
    const start = stats.indices;
    stats.indices += 18 * divisions;
    stats.groups.push({start, end: stats.indices, zOrder: this.zOrder});
  }

  _getVerticesForDivisions(divisions: number): number {
    return 6 * divisions;
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    groups: GeometryGroup[],
    groupIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    vertexCount: number,
    tessellation: number,
    loop: boolean,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
  ): [number, number] {
    return [arrayIndex, groupIndex];
  }

  _writeVertices(
    count: number,
    arrayBuffer: Float32Array,
    arrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    position: Vector2,
    edge: boolean,
    parameter: number = 1.0,
    previous?: PathCommand,
  ): number {
    for (let ii = 0; ii < count; ii++) {
      let vertexIndex = arrayIndex + attributeOffsets.vertex;
      arrayBuffer[vertexIndex] = position.x;
      arrayBuffer[vertexIndex + 1] = position.y;
      if (edge && (ii & 1) === 1) {
        arrayBuffer[arrayIndex + attributeOffsets.inside] = 1.0;
      }
      this._writeAttributes(
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        parameter,
        previous,
      );
      arrayIndex += vertexSize;
    }
    return arrayIndex;
  }

  _writeAttributes(
    arrayBuffer: Float32Array,
    arrayIndex: number,
    attributeOffsets: {[string]: number},
    parameter: number,
    previous: ?PathCommand,
  ) {
    const previousAttributes = previous && previous.attributes;
    if (previousAttributes) {
      for (const name in previousAttributes) {
        const previousValue: any = previousAttributes[name];
        const nextValue: any = this.attributes && this.attributes[name];
        const attributeIndex = arrayIndex + attributeOffsets[name];
        const previousArray = Array.isArray(previousValue);
        const nextArray = Array.isArray(nextValue);
        if (previousArray || nextArray) {
          const totalLength = Math.max(
            previousArray ? previousValue.length : 1,
            nextArray ? nextValue.length : 1,
          );
          for (let ii = 0; ii < totalLength; ii++) {
            arrayBuffer[attributeIndex + ii] = mix(
              (previousArray ? previousValue[ii] : previousValue) || 0,
              (nextArray ? nextValue[ii] : nextValue) || 0,
              parameter,
            );
          }
        } else {
          arrayBuffer[attributeIndex] = mix(
            previousValue,
            nextValue || 0,
            parameter,
          );
        }
      }
    }
    if (this.attributes) {
      for (const name in this.attributes) {
        if (previousAttributes && previousAttributes[name] !== undefined) {
          continue; // already written
        }
        const value = this.attributes[name];
        const attributeIndex = arrayIndex + attributeOffsets[name];
        if (Array.isArray(value)) {
          for (let ii = 0; ii < value.length; ii++) {
            arrayBuffer[attributeIndex + ii] = value[ii];
          }
        } else {
          arrayBuffer[attributeIndex] = value;
        }
      }
    }
  }

  _writeIndices(
    elementArrayBuffer: Uint32Array,
    elementArrayIndex: number,
    firstVertex: number,
    vertexCount: number,
    vertexOffset: number,
    loop: boolean,
  ) {
    const offsetVertex = firstVertex + vertexOffset;
    let v6: number, v7: number;
    if (loop) {
      v6 = firstVertex + ((vertexOffset + 6) % vertexCount);
      v7 = firstVertex + ((vertexOffset + 7) % vertexCount);
    } else {
      const maxVertex = vertexCount - 1;
      v6 = firstVertex + clamp(vertexOffset + 6, 0, maxVertex);
      v7 = firstVertex + clamp(vertexOffset + 7, 0, maxVertex);
    }
    elementArrayBuffer[elementArrayIndex++] = offsetVertex;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 2;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 1;

    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 1;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 2;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 3;

    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 2;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 5;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 3;

    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 2;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 4;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 5;

    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 4;
    elementArrayBuffer[elementArrayIndex++] = v6;
    elementArrayBuffer[elementArrayIndex++] = v7;

    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 4;
    elementArrayBuffer[elementArrayIndex++] = v7;
    elementArrayBuffer[elementArrayIndex++] = offsetVertex + 5;
  }
}

class MoveTo extends PathCommand {}

class LineTo extends PathCommand {
  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
  ) {
    super.updateStats(stats, tessellation, previous);
    this._addToStats(stats, 1);
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    groups: GeometryGroup[],
    groupIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    vertexCount: number,
    tessellation: number,
    loop: boolean,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
  ): [number, number] {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    this._writeIndices(
      elementArrayBuffer,
      groups[groupIndex++].start,
      firstArrayIndex / vertexSize,
      vertexCount,
      (arrayIndex - firstArrayIndex) / vertexSize,
      loop,
    );
    arrayIndex = this._writeVertices(
      4,
      arrayBuffer,
      arrayIndex,
      attributeOffsets,
      vertexSize,
      previous.dest,
      edge,
    );
    arrayIndex = this._writeVertices(
      this._getVerticesForDivisions(1) - 4,
      arrayBuffer,
      arrayIndex,
      attributeOffsets,
      vertexSize,
      this.dest,
      edge,
    );
    return [arrayIndex, groupIndex];
  }
}

class ArcTo extends PathCommand {
  radius: number;

  constructor(
    dest: Vector2,
    radius: number,
    zOrder: number,
    attributes: ?VertexAttributes,
  ) {
    super(dest, zOrder, attributes);
    this.radius = radius;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
  ) {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    super.updateStats(stats, tessellation, previous);
    const [length, divisions] = this._getArcParameters(tessellation, previous);
    this._addToStats(stats, divisions);
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    groups: GeometryGroup[],
    groupIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    vertexCount: number,
    tessellation: number,
    loop: boolean,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
  ): [number, number] {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    const [length, divisions] = this._getArcParameters(tessellation, previous);
    const angle = length / this.radius;
    const midpoint = timesEquals(plus(this.dest, previous.dest), 0.5);
    const distanceToCenter = this.radius * Math.cos(angle * 0.5);
    const directionToCenter = orthonormalizeEquals(
      minus(this.dest, previous.dest),
    );
    const center = plusEquals(
      times(directionToCenter, distanceToCenter),
      midpoint,
    );
    const a0 = Math.atan2(
      previous.dest.y - center.y,
      previous.dest.x - center.x,
    );
    const parameterIncrement = 1.0 / divisions;
    let parameter = 0.0;
    const point = equals(previous.dest);
    const verticesPerDivision = this._getVerticesForDivisions(1);
    const verticesPerDivisionMinus4 = verticesPerDivision - 4;
    const firstVertex = firstArrayIndex / vertexSize;
    for (let ii = 0; ii < divisions; ii++) {
      this._writeIndices(
        elementArrayBuffer,
        groups[groupIndex++].start,
        firstVertex,
        vertexCount,
        (arrayIndex - firstArrayIndex) / vertexSize,
        loop,
      );
      arrayIndex = this._writeVertices(
        4,
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        vertexSize,
        point,
        edge,
        parameter,
        previous,
      );
      parameter += parameterIncrement;
      const a = a0 + parameter * angle;
      point.x = center.x + this.radius * Math.cos(a);
      point.y = center.y + this.radius * Math.sin(a);
      arrayIndex = this._writeVertices(
        verticesPerDivisionMinus4,
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        vertexSize,
        point,
        edge,
        parameter,
        previous,
      );
    }
    return [arrayIndex, groupIndex];
  }

  _getArcParameters(
    tessellation: number,
    previous: PathCommand,
  ): [number, number] {
    const height = distance(previous.dest, this.dest) / 2.0;
    const length =
      2.0 * this.radius * Math.asin(clamp(height / this.radius, -1.0, 1.0));
    const divisions = Math.ceil(length * tessellation);
    return [length, divisions];
  }
}

class CurveTo extends PathCommand {
  c1: Vector2;
  c2: Vector2;

  constructor(
    dest: Vector2,
    c1: Vector2,
    c2: Vector2,
    zOrder: number,
    attributes: ?VertexAttributes,
  ) {
    super(dest, zOrder, attributes);
    this.c1 = c1;
    this.c2 = c2;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
  ) {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    super.updateStats(stats, tessellation, previous);
    const [a, b, c, d, length, divisions] = this._getSplineParameters(
      tessellation,
      previous,
    );
    this._addToStats(stats, divisions);
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    groups: GeometryGroup[],
    groupIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    vertexCount: number,
    tessellation: number,
    loop: boolean,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
  ): [number, number] {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    const [a, b, c, d, length, divisions] = this._getSplineParameters(
      tessellation,
      previous,
    );
    // get the coefficients of the quartic length function for normalization
    const aa = 0.5 * dot(a, a);
    const bb = dot(a, b);
    const cc = dot(a, c) + 0.5 * dot(b, b);
    const dd = dot(c, b);
    const parameterIncrement = 1.0 / divisions;
    let parameter = 0.0;
    const point = equals(previous.dest);
    const verticesPerDivision = this._getVerticesForDivisions(1);
    const verticesPerDivisionMinus4 = verticesPerDivision - 4;
    const firstVertex = firstArrayIndex / vertexSize;
    for (let ii = 0; ii < divisions; ii++) {
      this._writeIndices(
        elementArrayBuffer,
        groups[groupIndex++].start,
        firstVertex,
        vertexCount,
        (arrayIndex - firstArrayIndex) / vertexSize,
        loop,
      );
      arrayIndex = this._writeVertices(
        4,
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        vertexSize,
        point,
        edge,
        parameter,
        previous,
      );
      parameter += parameterIncrement;
      // approximate the normalized spline parameter using Newton's method
      const ee = -(length * parameter);
      let t = parameter;
      const ITERATIONS = 3;
      for (let jj = 0; jj < ITERATIONS; jj++) {
        const value = t * (t * (t * (t * aa + bb) + cc) + dd) + ee;
        const derivative = t * (t * (4 * t * aa + 3 * bb) + 2 * cc) + dd;
        if (derivative !== 0.0) {
          t -= value / derivative;
        }
      }
      t = clamp(t, 0.0, 1.0);
      point.x = t * (t * (t * a.x + b.x) + c.x) + d.x;
      point.y = t * (t * (t * a.y + b.y) + c.y) + d.y;
      arrayIndex = this._writeVertices(
        verticesPerDivisionMinus4,
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        vertexSize,
        point,
        edge,
        parameter,
        previous,
      );
    }
    return [arrayIndex, groupIndex];
  }

  _getSplineParameters(
    tessellation: number,
    previous: PathCommand,
  ): [Vector2, Vector2, Vector2, Vector2, number, number] {
    const d = previous.dest;
    const c = minus(this.c1, previous.dest);
    const b = minus(this.c2, previous.dest);
    const a = minusEquals(minusEquals(minus(this.dest, b), c), d);
    const length =
      0.5 * dot(a, a) + 0.5 * dot(b, b) + dot(a, b) + dot(a, c) + dot(c, b);
    const divisions = Math.ceil(length * tessellation);
    return [a, b, c, d, length, divisions];
  }
}

/**
 * A general representation of a shape.
 *
 * @param exterior the path defining the shape's exterior boundary.
 */
class Shape {
  exterior: Path;

  constructor(exterior: Path) {
    this.exterior = exterior;
    this.exterior.loop = true;
  }

  updateStats(stats: GeometryStats, tessellation: number) {
    let previousVertices = stats.vertices;
    this.exterior.updateStats(stats, tessellation);
    const exteriorVertices = stats.vertices - previousVertices;
    const triangles = exteriorVertices / 2 - 2;
    const indices = 3 * triangles;
    const start = stats.indices;
    stats.indices += indices;
    stats.groups.push({
      start,
      end: stats.indices,
      zOrder: this.exterior.zOrder,
    });
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    groups: GeometryGroup[],
    groupIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    thickness: number,
  ): [number, number] {
    const firstIndex = arrayIndex / vertexSize;
    [arrayIndex, groupIndex] = this.exterior.populateBuffers(
      arrayBuffer,
      elementArrayBuffer,
      arrayIndex,
      groups,
      groupIndex,
      attributeOffsets,
      vertexSize,
      tessellation,
      true,
    );
    let elementArrayIndex = groups[groupIndex++].start;
    const lastIndex = arrayIndex / vertexSize;
    const vertexCount = lastIndex - firstIndex;
    const vertexOffset = attributeOffsets.vertex;
    const planeOffset = attributeOffsets.plane - attributeOffsets.vertex;
    const leftLeftVertex = vec2();
    const leftVertex = vec2();
    const middleVertex = vec2();
    const rightVertex = vec2();
    const rightRightVertex = vec2();
    const middleLeft = vec2();
    const middleRight = vec2();
    const convexIndices: Set<number> = new Set();
    const concaveIndices: Set<number> = new Set();
    // odd vertices are inside
    for (let middle = 1; middle < vertexCount; middle += 2) {
      const leftIndex = firstIndex + ((middle + vertexCount - 2) % vertexCount);
      const middleIndex = firstIndex + middle;
      const rightIndex = firstIndex + ((middle + 2) % vertexCount);

      const leftArrayIndex = leftIndex * vertexSize + vertexOffset;
      const middleArrayIndex = middleIndex * vertexSize + vertexOffset;
      const rightArrayIndex = rightIndex * vertexSize + vertexOffset;

      vec2(
        arrayBuffer[leftArrayIndex] -
          thickness * arrayBuffer[leftArrayIndex + planeOffset],
        arrayBuffer[leftArrayIndex + 1] -
          thickness * arrayBuffer[leftArrayIndex + 1 + planeOffset],
        leftVertex,
      );
      vec2(
        arrayBuffer[middleArrayIndex] -
          thickness * arrayBuffer[middleArrayIndex + planeOffset],
        arrayBuffer[middleArrayIndex + 1] -
          thickness * arrayBuffer[middleArrayIndex + 1 + planeOffset],
        middleVertex,
      );
      vec2(
        arrayBuffer[rightArrayIndex] -
          thickness * arrayBuffer[rightArrayIndex + planeOffset],
        arrayBuffer[rightArrayIndex + 1] -
          thickness * arrayBuffer[rightArrayIndex + 1 + planeOffset],
        rightVertex,
      );
      minus(leftVertex, middleVertex, middleLeft);
      minus(rightVertex, middleVertex, middleRight);

      if (cross(middleRight, middleLeft) >= 0.0) {
        convexIndices.add(middle);
      } else {
        concaveIndices.add(middle);
      }
    }
    const point = vec2();
    const plane = {normal: vec2(), constant: 0.0};
    let remainingTriangles = vertexCount / 2 - 2;
    let iterationsWithoutTriangle = 0;
    while (remainingTriangles > 0) {
      let foundTriangle = false;
      let indices = convexIndices;
      let skipTest = false;
      if (convexIndices.size === 0) {
        console.warn('Ran out of convex indices to process.');
        indices = concaveIndices;
        skipTest = true;
      }
      if (iterationsWithoutTriangle > 1) {
        console.warn('Too many iterations: ' + iterationsWithoutTriangle);
        skipTest = true;
      }
      indexLoop: for (const middle of indices) {
        // find the indices of our neighbors
        let leftLeft = middle - 2;
        do {
          leftLeft = (leftLeft + vertexCount - 2) % vertexCount;
        } while (
          !(convexIndices.has(leftLeft) || concaveIndices.has(leftLeft))
        );
        let left = middle;
        do {
          left = (left + vertexCount - 2) % vertexCount;
        } while (!(convexIndices.has(left) || concaveIndices.has(left)));

        let right = middle;
        do {
          right = (right + 2) % vertexCount;
        } while (!(convexIndices.has(right) || concaveIndices.has(right)));

        let rightRight = middle + 2;
        do {
          rightRight = (rightRight + 2) % vertexCount;
        } while (
          !(convexIndices.has(rightRight) || concaveIndices.has(rightRight))
        );

        const leftLeftIndex = firstIndex + leftLeft;
        const leftIndex = firstIndex + left;
        const middleIndex = firstIndex + middle;
        const rightIndex = firstIndex + right;
        const rightRightIndex = firstIndex + rightRight;

        const leftLeftArrayIndex = leftLeftIndex * vertexSize + vertexOffset;
        const leftArrayIndex = leftIndex * vertexSize + vertexOffset;
        const middleArrayIndex = middleIndex * vertexSize + vertexOffset;
        const rightArrayIndex = rightIndex * vertexSize + vertexOffset;
        const rightRightArrayIndex =
          rightRightIndex * vertexSize + vertexOffset;

        vec2(
          arrayBuffer[leftLeftArrayIndex] -
            thickness * arrayBuffer[leftLeftArrayIndex + planeOffset],
          arrayBuffer[leftLeftArrayIndex + 1] -
            thickness * arrayBuffer[leftLeftArrayIndex + 1 + planeOffset],
          leftLeftVertex,
        );
        vec2(
          arrayBuffer[leftArrayIndex] -
            thickness * arrayBuffer[leftArrayIndex + planeOffset],
          arrayBuffer[leftArrayIndex + 1] -
            thickness * arrayBuffer[leftArrayIndex + 1 + planeOffset],
          leftVertex,
        );
        vec2(
          arrayBuffer[middleArrayIndex] -
            thickness * arrayBuffer[middleArrayIndex + planeOffset],
          arrayBuffer[middleArrayIndex + 1] -
            thickness * arrayBuffer[middleArrayIndex + 1 + planeOffset],
          middleVertex,
        );
        vec2(
          arrayBuffer[rightArrayIndex] -
            thickness * arrayBuffer[rightArrayIndex + planeOffset],
          arrayBuffer[rightArrayIndex + 1] -
            thickness * arrayBuffer[rightArrayIndex + 1 + planeOffset],
          rightVertex,
        );
        vec2(
          arrayBuffer[rightRightArrayIndex] -
            thickness * arrayBuffer[rightRightArrayIndex + planeOffset],
          arrayBuffer[rightRightArrayIndex + 1] -
            thickness * arrayBuffer[rightRightArrayIndex + 1 + planeOffset],
          rightRightVertex,
        );

        if (!skipTest) {
          planeFromPoints(leftVertex, rightVertex, plane);
          for (const indices of [convexIndices, concaveIndices]) {
            for (const index of indices) {
              if (index === left || index === middle || index === right) {
                continue;
              }
              const arrayIndex =
                (firstIndex + index) * vertexSize + vertexOffset;
              vec2(arrayBuffer[arrayIndex], arrayBuffer[arrayIndex + 1], point);
              if (signedDistance(plane, point) < 0) {
                continue indexLoop; // not an ear
              }
            }
          }
        }
        indices.delete(middle);

        // see if left or right changed convexity
        minus(leftLeftVertex, leftVertex, middleLeft);
        minus(rightVertex, leftVertex, middleRight);
        if (cross(middleRight, middleLeft) >= 0.0) {
          concaveIndices.delete(left);
          convexIndices.add(left);
        } else {
          convexIndices.delete(left);
          concaveIndices.add(left);
        }
        minus(leftVertex, rightVertex, middleLeft);
        minus(rightRightVertex, rightVertex, middleRight);
        if (cross(middleRight, middleLeft) >= 0.0) {
          concaveIndices.delete(right);
          convexIndices.add(right);
        } else {
          convexIndices.delete(right);
          concaveIndices.add(right);
        }
        elementArrayBuffer[elementArrayIndex++] = leftIndex;
        elementArrayBuffer[elementArrayIndex++] = middleIndex;
        elementArrayBuffer[elementArrayIndex++] = rightIndex;

        remainingTriangles--;
        foundTriangle = true;
        break;
      }
      if (foundTriangle) {
        iterationsWithoutTriangle = 0;
      } else {
        iterationsWithoutTriangle++;
      }
    }
    return [arrayIndex, groupIndex];
  }
}

/**
 * A general collection of shapes and paths with Logo-like builder tools.
 *
 * @param [shapes] the shapes to include in the collection, if any.
 * @param [paths] the paths to include in the collection, if any.
 */
export class ShapeList {
  shapes: Shape[];
  paths: Path[];

  position = vec2();
  rotation = 0.0;
  zOrder = 0;
  attributes: VertexAttributes = {};

  _drawingPath: ?Path;

  constructor(shapes: Shape[] = [], paths: Path[] = []) {
    this.shapes = shapes;
    this.paths = paths;
  }

  /**
   * Rotates the turtle left or right in degrees.
   *
   * @param angle the amount to rotate, in degrees (positive for CCW).
   * @return a reference to the list, for chaining.
   */
  pivot(angle: number): ShapeList {
    return this.rotate(radians(angle));
  }

  /**
   * Rotates the turtle left or right.
   *
   * @param angle the amount to rotate, in radians (positive for CCW).
   * @return a reference to the list, for chaining.
   */
  rotate(angle: number): ShapeList {
    this.rotation += angle;
    return this;
  }

  /**
   * Moves the turtle forward.
   *
   * @param distance the distance to advance.
   * @param [attributes] optional attributes for the new position.
   * @return a reference to the list, for chaining.
   */
  advance(distance: number, attributes?: VertexAttributes): ShapeList {
    this.position.x += distance * Math.cos(this.rotation);
    this.position.y += distance * Math.sin(this.rotation);
    attributes && Object.assign(this.attributes, attributes);
    if (this._drawingPath) {
      this._drawingPath.lineTo(
        equals(this.position),
        this.zOrder,
        Object.assign({}, this.attributes),
      );
    }
    return this;
  }

  /**
   * Jumps to a new location.
   *
   * @param x the x coordinate to jump to.
   * @param y the y coordinate to jump to.
   * @param [attributes] optional attributes for the new position.
   * @return a reference to the list, for chaining.
   */
  jump(
    x: number,
    y: number,
    rotation?: number,
    attributes?: VertexAttributes,
  ): ShapeList {
    this.position.x = x;
    this.position.y = y;
    if (rotation != null) {
      this.rotation = rotation;
    }
    attributes && Object.assign(this.attributes, attributes);
    if (this._drawingPath) {
      this._drawingPath.lineTo(
        vec2(x, y),
        this.zOrder,
        Object.assign({}, this.attributes),
      );
    }
    return this;
  }

  /**
   * Moves the turtle forward in an arc specified in degrees.
   *
   * @param angle the angle to turn in degrees.
   * @param radius the radius of the arc.
   * @param [attributes] optional attributes for the new position.
   * @return a reference to the list, for chaining.
   */
  turn(
    angle: number,
    radius: number,
    attributes?: VertexAttributes,
  ): ShapeList {
    return this.arc(radians(angle), radius, attributes);
  }

  /**
   * Moves the turtle forward in an arc.
   *
   * @param angle the angle to turn in radians.
   * @param radius the radius of the arc.
   * @param [attributes] optional attributes for the new position.
   * @return a reference to the list, for chaining.
   */
  arc(
    angle: number,
    radius: number,
    attributes?: ?VertexAttributes,
  ): ShapeList {
    if (angle > Math.PI || angle < -Math.PI) {
      // angles must be <= 180 degrees
      const halfAngle = angle * 0.5;
      return this.arc(halfAngle, radius, attributes).arc(
        halfAngle,
        radius,
        attributes,
      );
    }
    const nextRotation = this.rotation + angle;
    this.position.x +=
      radius * (Math.sin(nextRotation) - Math.sin(this.rotation));
    this.position.y +=
      radius * (Math.cos(this.rotation) - Math.cos(nextRotation));
    this.rotation = nextRotation;
    attributes && Object.assign(this.attributes, attributes);
    if (this._drawingPath) {
      this._drawingPath.arcTo(
        equals(this.position),
        radius,
        this.zOrder,
        Object.assign({}, this.attributes),
      );
    }
    return this;
  }

  /**
   * Moves the turtle forward in a cubic spline curve.
   *
   * @param firstDistance the distance to the first control point.
   * @param firstAngle the angle to turn after the first control point.
   * @param secondDistance the distance to the second control point.
   * @param secondAngle the angle to turn after the second control point.
   * @param thirdDistance the distance to the final destination.
   * @param [attributes] optional attributes for the new position.
   * @return a reference to the list, for chaining.
   */
  curve(
    firstDistance: number,
    firstAngle: number,
    secondDistance: number,
    secondAngle: number,
    thirdDistance: number,
    attributes?: VertexAttributes,
  ): ShapeList {
    this.position.x += firstDistance * Math.cos(this.rotation);
    this.position.y += firstDistance * Math.sin(this.rotation);
    const c1 = equals(this.position);
    this.rotation += firstAngle;
    this.position.x += secondDistance * Math.cos(this.rotation);
    this.position.y += secondDistance * Math.sin(this.rotation);
    const c2 = equals(this.position);
    this.rotation += secondAngle;
    this.position.x += thirdDistance * Math.cos(this.rotation);
    this.position.y += thirdDistance * Math.sin(this.rotation);
    attributes && Object.assign(this.attributes, attributes);
    if (this._drawingPath) {
      this._drawingPath.curveTo(
        equals(this.position),
        c1,
        c2,
        this.zOrder,
        Object.assign({}, this.attributes),
      );
    }
    return this;
  }

  /**
   * Puts the pen down (starts drawing).
   *
   * @param [shape=false] if true, draw a filled shape rather than a path.
   * @return a reference to the list, for chaining.
   */
  penDown(shape: boolean = false): ShapeList {
    this._drawingPath = new Path();
    if (shape) {
      this.shapes.push(new Shape(this._drawingPath));
    } else {
      this.paths.push(this._drawingPath);
    }
    this._drawingPath.moveTo(
      equals(this.position),
      this.zOrder,
      Object.assign(this.attributes),
    );
    return this;
  }

  /**
   * Picks the pen up (stops drawing).
   *
   * @param [closeLoop=false] if true and we were drawing a path, make that
   * path a closed loop.
   * @return a reference to the list, for chaining.
   */
  penUp(closeLoop?: boolean): ShapeList {
    if (this._drawingPath) {
      if (closeLoop != null) {
        this._drawingPath.loop = closeLoop;
      }
      this._drawingPath = null;
    }
    return this;
  }

  /**
   * Raises the z order.
   *
   * @param [amount=1] the amount to raise.
   * @return a reference to the list, for chaining.
   */
  raise(amount: number = 1): ShapeList {
    this.zOrder += amount;
    return this;
  }

  /**
   * Lowers the z order.
   *
   * @param [amount=1] the amount to lower.
   * @return a reference to the list, for chaining.
   */
  lower(amount: number = 1): ShapeList {
    this.zOrder -= amount;
    return this;
  }

  /**
   * Applies an operation to the shape list.
   *
   * @param op the operation to apply.
   * @return a reference to the list, for chaining.
   */
  apply(op: ShapeList => mixed): ShapeList {
    op(this);
    return this;
  }

  /**
   * Creates the indexed triangle geometry for this shape list.
   *
   * @param tessellation the tessellation level.
   * @param thickness the thickness used to offset vertices for triangulation.
   * @return a tuple consisting of the array buffer (vertex data),
   * element array buffer (indices), and the attribute sizes.
   */
  createGeometry(
    tessellation: number = 4.0,
    thickness: number = 0.01,
  ): [Float32Array, Uint32Array, {[string]: number}] {
    // first pass: get stats
    const stats: GeometryStats = {
      attributeSizes: {vertex: 2, plane: 3, inside: 1},
      vertices: 0,
      indices: 0,
      groups: [],
    };
    for (const shape of this.shapes) {
      shape.updateStats(stats, tessellation);
    }
    for (const path of this.paths) {
      path.updateStats(stats, tessellation);
    }
    const attributeOffsets: {[string]: number} = {};
    let vertexSize = 0;
    for (const name in stats.attributeSizes) {
      attributeOffsets[name] = vertexSize;
      vertexSize += stats.attributeSizes[name];
    }

    // sort groups by increasing z index
    const sortedGroups = stats.groups
      .slice()
      .sort((first, second) => first.zOrder - second.zOrder);

    // adjust ranges to reorder
    let elementArrayIndex = 0;
    for (const group of sortedGroups) {
      const groupSize = group.end - group.start;
      group.start = elementArrayIndex;
      elementArrayIndex += groupSize;
      group.end = elementArrayIndex;
    }

    // now we can allocate the buffers and populate them
    const arrayBuffer = new Float32Array(stats.vertices * vertexSize);
    const elementArrayBuffer = new Uint32Array(stats.indices);
    let arrayIndex = 0;
    let groupIndex = 0;
    for (const shape of this.shapes) {
      [arrayIndex, groupIndex] = shape.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        stats.groups,
        groupIndex,
        attributeOffsets,
        vertexSize,
        tessellation,
        thickness,
      );
    }
    for (const path of this.paths) {
      [arrayIndex, groupIndex] = path.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        stats.groups,
        groupIndex,
        attributeOffsets,
        vertexSize,
        tessellation,
        false,
      );
    }
    return [arrayBuffer, elementArrayBuffer, stats.attributeSizes];
  }
}
