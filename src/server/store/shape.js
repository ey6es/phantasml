/**
 * Shape definitions.
 *
 * @module server/store/shape
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
  orthogonalize,
  orthonormalizeEquals,
  normalize,
  normalizeEquals,
  dot,
  cross,
  negativeEquals,
  planeFromPoints,
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
export class Path {
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
   * Checks whether the path requires tessellation (because it has curves).
   *
   * @return whether or not the path requires tessellation.
   */
  requiresTessellation(): boolean {
    for (const command of this.commands) {
      if (command.requiresTessellation()) {
        return true;
      }
    }
    return false;
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

  updateStats(stats: GeometryStats, tessellation: number, edge: boolean) {
    this._ensureStartPosition(0);
    const previousVertices = stats.vertices;
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previous: ?PathCommand;
      if (this.loop) {
        const lastIndex = this.commands.length - 1;
        previous = this.commands[(ii + lastIndex) % this.commands.length];
      } else {
        previous = this.commands[ii - 1];
      }
      command.updateStats(stats, tessellation, previous, edge);
    }
    if (stats.vertices === previousVertices) {
      // special handling for zero-length paths
      stats.vertices += 4;
      const start = stats.indices;
      stats.indices += 6;
      stats.groups.push({
        start,
        end: stats.indices,
        zOrder: this.commands[0].zOrder,
      });
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
    const previousGroupIndex = groupIndex;
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previous: ?PathCommand;
      const lastIndex = this.commands.length - 1;
      let start = false;
      let end = false;
      if (this.loop) {
        previous = this.commands[(ii + lastIndex) % this.commands.length];
      } else {
        previous = this.commands[ii - 1];
        start = ii === 1;
        end = ii === lastIndex;
      }
      [arrayIndex, groupIndex] = command.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        groups,
        groupIndex,
        attributeOffsets,
        vertexSize,
        tessellation,
        previous,
        edge,
        start,
        end,
      );
    }
    if (groupIndex === previousGroupIndex) {
      // special handling for zero-length paths
      const baseIndex = arrayIndex / vertexSize;

      const command = this.commands[0];
      for (let ii = 0; ii < 4; ii++) {
        const vertexIndex = arrayIndex + attributeOffsets.vertex;
        arrayBuffer[vertexIndex] = command.dest.x;
        arrayBuffer[vertexIndex + 1] = command.dest.y;
        const vectorIndex = arrayIndex + attributeOffsets.vector;
        arrayBuffer[vectorIndex] = ii & 1 ? -1 : 1;
        arrayBuffer[vectorIndex + 1] = ii & 2 ? 1 : -1;
        command._writeAttributes(
          arrayBuffer,
          arrayIndex,
          attributeOffsets,
          1.0,
          command,
        );
        arrayIndex += vertexSize;
      }

      let elementArrayIndex = groups[groupIndex++].start;

      elementArrayBuffer[elementArrayIndex++] = baseIndex;
      elementArrayBuffer[elementArrayIndex++] = baseIndex + 2;
      elementArrayBuffer[elementArrayIndex++] = baseIndex + 1;

      elementArrayBuffer[elementArrayIndex++] = baseIndex + 1;
      elementArrayBuffer[elementArrayIndex++] = baseIndex + 2;
      elementArrayBuffer[elementArrayIndex++] = baseIndex + 3;
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

  requiresTessellation(): boolean {
    return false;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
    edge: boolean,
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

  _addToStats(stats: GeometryStats, divisions: number, edge: boolean) {
    stats.vertices += this._getVerticesForDivisions(divisions, edge);
    const start = stats.indices;
    stats.indices += 18 * divisions;
    stats.groups.push({start, end: stats.indices, zOrder: this.zOrder});
  }

  _getVerticesForDivisions(divisions: number, edge: boolean): number {
    return (edge ? 9 : 8) * divisions;
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
    previous: ?PathCommand,
    edge: boolean,
    start: boolean,
    end: boolean,
  ): [number, number] {
    return [arrayIndex, groupIndex];
  }

  _writeDivision(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    previous: PathCommand,
    edge: boolean,
    fromPosition: Vector2,
    fromParameter: number,
    toPosition: Vector2,
    toParameter: number,
    start: boolean,
    end: boolean,
  ): [number, number] {
    const baseIndex = arrayIndex / vertexSize;

    const vector = normalizeEquals(minus(toPosition, fromPosition));
    arrayIndex = this._writeVertices(
      arrayBuffer,
      arrayIndex,
      attributeOffsets,
      vertexSize,
      fromPosition,
      vector,
      fromParameter,
      previous,
      !start,
    );
    negativeEquals(vector);
    arrayIndex = this._writeVertices(
      arrayBuffer,
      arrayIndex,
      attributeOffsets,
      vertexSize,
      toPosition,
      vector,
      toParameter,
      previous,
      !end,
    );

    if (edge) {
      const vertexIndex = arrayIndex + attributeOffsets.vertex;
      arrayBuffer[vertexIndex] = toPosition.x;
      arrayBuffer[vertexIndex + 1] = toPosition.y;
      this._writeAttributes(
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        toParameter,
        previous,
      );
      arrayIndex += vertexSize;
    }

    elementArrayBuffer[elementArrayIndex++] = baseIndex;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 2;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 1;

    elementArrayBuffer[elementArrayIndex++] = baseIndex + 1;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 2;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 3;

    elementArrayBuffer[elementArrayIndex++] = baseIndex + 2;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 7;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 3;

    elementArrayBuffer[elementArrayIndex++] = baseIndex + 3;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 7;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 6;

    elementArrayBuffer[elementArrayIndex++] = baseIndex + 7;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 5;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 6;

    elementArrayBuffer[elementArrayIndex++] = baseIndex + 6;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 5;
    elementArrayBuffer[elementArrayIndex++] = baseIndex + 4;

    return [arrayIndex, elementArrayIndex];
  }

  _writeVertices(
    arrayBuffer: Float32Array,
    arrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    position: Vector2,
    vector: Vector2,
    parameter: number,
    previous: PathCommand,
    joint: boolean,
  ): number {
    const orthoVector = orthogonalize(vector);
    const orthoNormalVector = normalize(orthoVector);
    for (let ii = 0; ii < 4; ii++) {
      const vertexIndex = arrayIndex + attributeOffsets.vertex;
      arrayBuffer[vertexIndex] = position.x;
      arrayBuffer[vertexIndex + 1] = position.y;
      const vectorIndex = arrayIndex + attributeOffsets.vector;
      const signX = ii & 1 ? 1 : -1;
      if (ii & 2) {
        arrayBuffer[vectorIndex] = signX * orthoNormalVector.x;
        arrayBuffer[vectorIndex + 1] = signX * orthoNormalVector.y;
      } else {
        arrayBuffer[vectorIndex] = signX * orthoVector.x - vector.x;
        arrayBuffer[vectorIndex + 1] = signX * orthoVector.y - vector.y;
        arrayBuffer[arrayIndex + attributeOffsets.joint] = joint ? 1.0 : 0.0;
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
    previous: PathCommand,
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
}

class MoveTo extends PathCommand {}

class LineTo extends PathCommand {
  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
    edge: boolean,
  ) {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    super.updateStats(stats, tessellation, previous, edge);
    if (distance(previous.dest, this.dest) > 0) {
      this._addToStats(stats, 1, edge);
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
    previous: ?PathCommand,
    edge: boolean,
    start: boolean,
    end: boolean,
  ): [number, number] {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    if (distance(previous.dest, this.dest) > 0) {
      let elementArrayIndex = groups[groupIndex++].start;
      [arrayIndex, elementArrayIndex] = this._writeDivision(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        elementArrayIndex,
        attributeOffsets,
        vertexSize,
        previous,
        edge,
        previous.dest,
        0.0,
        this.dest,
        1.0,
        start,
        end,
      );
    }
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

  requiresTessellation(): boolean {
    return true;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
    edge: boolean,
  ) {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    super.updateStats(stats, tessellation, previous, edge);
    const [length, divisions] = this._getArcParameters(tessellation, previous);
    this._addToStats(stats, divisions, edge);
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
    previous: ?PathCommand,
    edge: boolean,
    start: boolean,
    end: boolean,
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
    const lastPoint = vec2();
    let elementArrayIndex = groups[groupIndex++].start;
    for (let ii = 0; ii < divisions; ii++) {
      equals(point, lastPoint);
      const lastParameter = parameter;
      parameter += parameterIncrement;
      const a = a0 + parameter * angle;
      point.x = center.x + this.radius * Math.cos(a);
      point.y = center.y + this.radius * Math.sin(a);
      [arrayIndex, elementArrayIndex] = this._writeDivision(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        elementArrayIndex,
        attributeOffsets,
        vertexSize,
        previous,
        edge,
        lastPoint,
        lastParameter,
        point,
        parameter,
        start && ii === 0,
        end && ii === divisions - 1,
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

  requiresTessellation(): boolean {
    return true;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    previous: ?PathCommand,
    edge: boolean,
  ) {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    super.updateStats(stats, tessellation, previous, edge);
    const [a, b, c, d, divisions] = this._getSplineParameters(
      tessellation,
      previous,
    );
    this._addToStats(stats, divisions, edge);
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
    previous: ?PathCommand,
    edge: boolean,
    start: boolean,
    end: boolean,
  ): [number, number] {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    const [a, b, c, d, divisions] = this._getSplineParameters(
      tessellation,
      previous,
    );
    const parameterIncrement = 1.0 / divisions;
    let parameter = 0.0;
    const point = equals(previous.dest);
    const lastPoint = vec2();
    let elementArrayIndex = groups[groupIndex++].start;
    for (let ii = 0; ii < divisions; ii++) {
      equals(point, lastPoint);
      const lastParameter = parameter;
      parameter += parameterIncrement;
      const t = parameter;
      point.x = t * (t * (t * a.x + b.x) + c.x) + d.x;
      point.y = t * (t * (t * a.y + b.y) + c.y) + d.y;
      [arrayIndex, elementArrayIndex] = this._writeDivision(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        elementArrayIndex,
        attributeOffsets,
        vertexSize,
        previous,
        edge,
        lastPoint,
        lastParameter,
        point,
        parameter,
        start && ii === 1,
        end && ii === divisions - 1,
      );
    }
    return [arrayIndex, groupIndex];
  }

  _getSplineParameters(
    tessellation: number,
    previous: PathCommand,
  ): [Vector2, Vector2, Vector2, Vector2, number] {
    const d = previous.dest;
    const c = timesEquals(minus(this.c1, previous.dest), 3);
    const b = timesEquals(
      plusEquals(plusEquals(times(this.c1, -2), previous.dest), this.c2),
      3.0,
    );
    const a = minusEquals(minusEquals(minus(this.dest, b), c), d);
    // approx. length using gaussian quadrature
    // https://pomax.github.io/bezierinfo/#arclength
    const a3 = times(a, 3.0);
    const b2 = times(b, 2.0);
    const fn = (t: number) => {
      const x = t * (t * a3.x + b2.x) + c.x;
      const y = t * (t * a3.y + b2.y) + c.y;
      return Math.sqrt(x * x + y * y);
    };
    const approxLength =
      0.5 *
      (0.5688888889 * fn(0.5) +
        0.4786286705 * fn(0.230765345) +
        0.4786286705 * fn(0.769234655) +
        0.2369268851 * fn(0.046910077) +
        0.2369268851 * fn(0.953089923));
    const divisions = Math.ceil(approxLength * tessellation);
    return [a, b, c, d, divisions];
  }
}

type Vertex = {
  index: number,
  position: Vector2,
  left: Vertex,
  right: Vertex,
};

/**
 * A general representation of a shape.
 *
 * @param exterior the path defining the shape's exterior boundary.
 */
export class Shape {
  exterior: Path;

  constructor(exterior: Path) {
    this.exterior = exterior;
    this.exterior.loop = true;
  }

  /**
   * Checks whether the shape requires tessellation (because it has curves).
   *
   * @return whether or not the shape requires tessellation.
   */
  requiresTessellation(): boolean {
    return this.exterior.requiresTessellation();
  }

  updateStats(stats: GeometryStats, tessellation: number) {
    const group = {start: 0, end: 0, zOrder: this.exterior.zOrder};
    stats.groups.push(group);
    let previousVertices = stats.vertices;
    this.exterior.updateStats(stats, tessellation, true);
    const exteriorVertices = stats.vertices - previousVertices;
    const triangles = exteriorVertices / 9 - 2;
    const indices = 3 * triangles;
    group.start = stats.indices;
    stats.indices += indices;
    group.end = stats.indices;
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
  ): [number, number] {
    const firstIndex = arrayIndex / vertexSize;
    let elementArrayIndex = groups[groupIndex++].start;
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
    const lastIndex = arrayIndex / vertexSize;
    const vertexCount = lastIndex - firstIndex;
    const vertexOffset = attributeOffsets.vertex;

    // create the linked array of vertex objects
    const vertices: Vertex[] = [];
    for (let ii = 8; ii < vertexCount; ii += 9) {
      const index = firstIndex + ii;
      const arrayIndex = index * vertexSize + vertexOffset;
      vertices.push(
        ({
          index,
          position: vec2(arrayBuffer[arrayIndex], arrayBuffer[arrayIndex + 1]),
        }: any),
      );
    }
    for (let ii = 0; ii < vertices.length; ii++) {
      const vertex = vertices[ii];
      vertex.left = vertices[(ii + vertices.length - 1) % vertices.length];
      vertex.right = vertices[(ii + 1) % vertices.length];
    }

    const leftMiddle = vec2();
    const leftRight = vec2();
    const convexVertices: Set<Vertex> = new Set();
    const concaveVertices: Set<Vertex> = new Set();
    // odd vertices are inside
    for (const vertex of vertices) {
      minus(vertex.position, vertex.left.position, leftMiddle);
      minus(vertex.right.position, vertex.left.position, leftRight);

      if (cross(leftMiddle, leftRight) >= 0.0) {
        convexVertices.add(vertex);
      } else {
        concaveVertices.add(vertex);
      }
    }
    const point = vec2();
    const plane = {normal: vec2(), constant: 0.0};
    let remainingTriangles = vertices.length - 2;
    let iterationsWithoutTriangle = 0;
    while (remainingTriangles > 0) {
      let foundTriangle = false;
      let loopVertices = convexVertices;
      let skipTest = false;
      if (convexVertices.size === 0) {
        loopVertices = concaveVertices;
        skipTest = true;
      }
      if (iterationsWithoutTriangle > 1) {
        skipTest = true;
      }
      vertexLoop: for (const vertex of loopVertices) {
        if (!skipTest) {
          planeFromPoints(vertex.left.position, vertex.right.position, plane);
          for (const testVertices of [convexVertices, concaveVertices]) {
            for (const testVertex of testVertices) {
              if (
                signedDistance(plane, testVertex.position) < 0 &&
                testVertex !== vertex &&
                testVertex !== vertex.left &&
                testVertex !== vertex.right
              ) {
                continue vertexLoop; // not an ear
              }
            }
          }
        }
        vertex.left.right = vertex.right;
        vertex.right.left = vertex.left;
        loopVertices.delete(vertex);

        // see if left or right changed convexity
        minus(vertex.left.position, vertex.left.left.position, leftMiddle);
        minus(vertex.right.position, vertex.left.left.position, leftRight);
        if (cross(leftMiddle, leftRight) >= 0.0) {
          concaveVertices.delete(vertex.left);
          convexVertices.add(vertex.left);
        } else {
          convexVertices.delete(vertex.left);
          concaveVertices.add(vertex.left);
        }
        minus(vertex.right.position, vertex.left.position, leftMiddle);
        minus(vertex.right.right.position, vertex.left.position, leftRight);
        if (cross(leftMiddle, leftRight) >= 0.0) {
          concaveVertices.delete(vertex.right);
          convexVertices.add(vertex.right);
        } else {
          convexVertices.delete(vertex.right);
          concaveVertices.add(vertex.right);
        }
        elementArrayBuffer[elementArrayIndex++] = vertex.left.index;
        elementArrayBuffer[elementArrayIndex++] = vertex.index;
        elementArrayBuffer[elementArrayIndex++] = vertex.right.index;

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
   * Adds the contents of another shape list to this one.
   *
   * @param other the list to add.
   */
  add(other: ShapeList) {
    this.shapes = this.shapes.concat(other.shapes);
    this.paths = this.paths.concat(other.paths);
  }

  /**
   * Checks whether the shape list requires tessellation (because it has curved
   * paths).
   *
   * @return whether or not the shape list requires tessellation.
   */
  requiresTessellation(): boolean {
    for (const shape of this.shapes) {
      if (shape.requiresTessellation()) {
        return true;
      }
    }
    for (const path of this.paths) {
      if (path.requiresTessellation()) {
        return true;
      }
    }
    return false;
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
   * @param [rotation] optional new rotation in degrees.
   * @param [attributes] optional attributes for the new position.
   * @return a reference to the list, for chaining.
   */
  move(
    x: number,
    y: number,
    rotation?: number,
    attributes?: VertexAttributes,
  ): ShapeList {
    return this.jump(
      x,
      y,
      rotation == null ? null : radians(rotation),
      attributes,
    );
  }

  /**
   * Jumps to a new location.
   *
   * @param x the x coordinate to jump to.
   * @param y the y coordinate to jump to.
   * @param [rotation] optional new rotation in radians.
   * @param [attributes] optional attributes for the new position.
   * @return a reference to the list, for chaining.
   */
  jump(
    x: number,
    y: number,
    rotation?: ?number,
    attributes?: ?VertexAttributes,
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
   * @param [attributes] optional starting attributes.
   * @return a reference to the list, for chaining.
   */
  penDown(shape: boolean = false, attributes?: VertexAttributes): ShapeList {
    this._drawingPath = new Path();
    if (shape) {
      this.shapes.push(new Shape(this._drawingPath));
    } else {
      this.paths.push(this._drawingPath);
    }
    attributes && Object.assign(this.attributes, attributes);
    this._drawingPath.moveTo(
      equals(this.position),
      this.zOrder,
      Object.assign({}, this.attributes),
    );
    return this;
  }

  /**
   * Picks the pen up (stops drawing).
   *
   * @return a reference to the list, for chaining.
   */
  penUp(): ShapeList {
    this._drawingPath = null;
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
   * Sets the attributes.
   *
   * @param attributes the attributes to set.
   * @return a reference to the list, for chaining.
   */
  setAttributes(attributes: VertexAttributes): ShapeList {
    Object.assign(this.attributes, attributes);
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
   * @return a tuple consisting of the array buffer (vertex data),
   * element array buffer (indices), and the attribute sizes.
   */
  createGeometry(
    tessellation: number = 4.0,
  ): [Float32Array, Uint32Array, {[string]: number}] {
    // first pass: get stats
    const stats: GeometryStats = {
      attributeSizes: {vertex: 2, vector: 2, joint: 1},
      vertices: 0,
      indices: 0,
      groups: [],
    };
    for (const shape of this.shapes) {
      shape.updateStats(stats, tessellation);
    }
    for (const path of this.paths) {
      path.updateStats(stats, tessellation, false);
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
