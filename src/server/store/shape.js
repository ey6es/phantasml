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
  orthonormalizeEquals,
  dot,
  cross,
  planeFromPoints,
  signedDistance,
  mix,
} from './math';

type VertexAttributes = {[string]: number | number[]};

type GeometryStats = {
  attributeSizes: {[string]: number},
  vertices: number,
  indices: number,
};

/**
 * A general representation of a path.
 *
 * @param [loop=false] whether or not the path represents a loop.
 */
class Path {
  loop: boolean;
  commands: PathCommand[] = [];

  constructor(loop: boolean = false) {
    this.loop = loop;
  }

  /**
   * Adds a command to move to a destination point.
   *
   * @param dest the point to move to.
   * @param [attributes] optional additional vertex attributes.
   * @return a reference to this path, for chaining.
   */
  moveTo(dest: Vector2, attributes?: VertexAttributes): Path {
    this.commands.push(new MoveTo(dest, attributes));
    return this;
  }

  /**
   * Adds a command to draw a line to a destination point.
   *
   * @param dest the point to draw to.
   * @param [attributes] optional additional vertex attributes.
   * @return a reference to this path, for chaining.
   */
  lineTo(dest: Vector2, attributes?: VertexAttributes): Path {
    this._ensureStartPosition(attributes);
    this.commands.push(new LineTo(dest, attributes));
    return this;
  }

  /**
   * Adds a command to draw an arc to a destination point.
   *
   * @param dest the point to draw to.
   * @param radius the signed radius of the arc (a negative value indicates
   * a left rather than right turn).
   * @param [attributes] optional additional vertex attributes.
   * @return a reference to this path, for chaining.
   */
  arcTo(dest: Vector2, radius: number, attributes?: VertexAttributes): Path {
    this._ensureStartPosition(attributes);
    this.commands.push(new ArcTo(dest, radius, attributes));
    return this;
  }

  /**
   * Adds a command to draw a cubic Bezier curve to a destination point.
   *
   * @param dest the point to draw to.
   * @param c1 the first internal control point.
   * @param c2 the second internal control point.
   * @param [attributes] optional additional vertex attributes.
   * @return a reference to this path, for chaining.
   */
  curveTo(
    dest: Vector2,
    c1: Vector2,
    c2: Vector2,
    attributes?: VertexAttributes,
  ): Path {
    this._ensureStartPosition(attributes);
    this.commands.push(new CurveTo(dest, c1, c2, attributes));
    return this;
  }

  _ensureStartPosition(attributes: ?VertexAttributes) {
    if (this.commands.length === 0) {
      this.commands.push(new MoveTo({x: 0.0, y: 0.0}, attributes));
    }
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean = false,
  ) {
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previous: ?PathCommand;
      let closeLoop = false;
      if (this.loop || edge) {
        const lastIndex = this.commands.length - 1;
        previous = this.commands[(ii + lastIndex) % this.commands.length];
        closeLoop = ii === lastIndex;
      } else {
        previous = this.commands[ii - 1];
      }
      command.updateStats(stats, tessellation, edge, previous, closeLoop);
    }
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    edge: boolean = false,
  ): [number, number] {
    // start with just the vertices/attributes
    const firstArrayIndex = arrayIndex;
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previous: ?PathCommand;
      let closeLoop = false;
      if (this.loop || edge) {
        const lastIndex = this.commands.length - 1;
        previous = this.commands[(ii + lastIndex) % this.commands.length];
        closeLoop = ii === lastIndex;
      } else {
        previous = this.commands[ii - 1];
      }
      [arrayIndex, elementArrayIndex] = command.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        elementArrayIndex,
        attributeOffsets,
        vertexSize,
        tessellation,
        edge,
        firstArrayIndex,
        previous,
        closeLoop,
      );
    }
    // fill in the plane attributes now that we have all vertices
    const vertexSpan = edge ? vertexSize : vertexSize * 2;
    const lastArrayIndex = arrayIndex - vertexSpan;
    for (
      let index = firstArrayIndex;
      index <= lastArrayIndex;
      index += vertexSpan
    ) {
      // examine the current vertex and its neighbors
      const currentIndex = index + attributeOffsets.vertex;
      let fromIndex = currentIndex - vertexSpan;
      if (index === firstArrayIndex) {
        if (this.loop || edge) {
          fromIndex = lastArrayIndex + attributeOffsets.vertex;
        } else {
          fromIndex = currentIndex;
        }
      }
      let toIndex = currentIndex + vertexSpan;
      if (index === lastArrayIndex) {
        if (this.loop || edge) {
          toIndex = firstArrayIndex + attributeOffsets.vertex;
        } else {
          toIndex = currentIndex;
        }
      }

      // find the plane coefficients for the vertex
      const x = arrayBuffer[toIndex + 1] - arrayBuffer[fromIndex + 1];
      const y = arrayBuffer[fromIndex] - arrayBuffer[toIndex];
      const length = Math.sqrt(x * x + y * y);
      const scale = length === 0.0 ? 1.0 : 1.0 / length;
      const nx = x * scale;
      const ny = y * scale;
      const constant = -(
        nx * arrayBuffer[currentIndex] +
        ny * arrayBuffer[currentIndex + 1]
      );

      // set them for the current vertex
      let planeIndex = index + attributeOffsets.plane;
      arrayBuffer[planeIndex] = nx;
      arrayBuffer[planeIndex + 1] = ny;
      arrayBuffer[planeIndex + 2] = constant;

      // for non-edges, also set the other side
      if (!edge) {
        planeIndex += vertexSize;
        arrayBuffer[planeIndex] = -nx;
        arrayBuffer[planeIndex + 1] = -ny;
        arrayBuffer[planeIndex + 2] = -constant;
      }
    }
    return [arrayIndex, elementArrayIndex];
  }
}

class PathCommand {
  dest: Vector2;
  attributes: ?VertexAttributes;

  constructor(dest: Vector2, attributes: ?VertexAttributes) {
    this.dest = dest;
    this.attributes = attributes;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean,
    previous: ?PathCommand,
    closeLoop: boolean,
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

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
    closeLoop: boolean,
  ): [number, number] {
    return [arrayIndex, elementArrayIndex];
  }

  _writeVertices(
    arrayBuffer: Float32Array,
    arrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    edge: boolean,
    position: Vector2,
    parameter: number = 1.0,
    previous?: PathCommand,
  ): number {
    let vertexIndex = arrayIndex + attributeOffsets.vertex;
    arrayBuffer[vertexIndex] = position.x;
    arrayBuffer[vertexIndex + 1] = position.y;
    this._writeAttributes(
      arrayBuffer,
      arrayIndex,
      attributeOffsets,
      parameter,
      previous,
    );
    arrayIndex += vertexSize;
    if (!edge) {
      vertexIndex = arrayIndex + attributeOffsets.vertex;
      arrayBuffer[vertexIndex] = position.x;
      arrayBuffer[vertexIndex + 1] = position.y;
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
    fromIndex: number,
    toIndex: number,
  ): number {
    elementArrayBuffer[elementArrayIndex++] = fromIndex;
    elementArrayBuffer[elementArrayIndex++] = toIndex;
    elementArrayBuffer[elementArrayIndex++] = fromIndex + 1;

    elementArrayBuffer[elementArrayIndex++] = toIndex;
    elementArrayBuffer[elementArrayIndex++] = toIndex + 1;
    elementArrayBuffer[elementArrayIndex++] = fromIndex + 1;

    return elementArrayIndex;
  }
}

class MoveTo extends PathCommand {
  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean,
    previous: ?PathCommand,
    closeLoop: boolean,
  ) {
    super.updateStats(stats, tessellation, edge, previous, closeLoop);
    stats.vertices += edge ? 1 : 2;
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
    closeLoop: boolean,
  ): [number, number] {
    arrayIndex = this._writeVertices(
      arrayBuffer,
      arrayIndex,
      attributeOffsets,
      vertexSize,
      edge,
      this.dest,
    );
    return [arrayIndex, elementArrayIndex];
  }
}

class LineTo extends PathCommand {
  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean,
    previous: ?PathCommand,
    closeLoop: boolean,
  ) {
    super.updateStats(stats, tessellation, edge, previous, closeLoop);
    if (!closeLoop) {
      stats.vertices += edge ? 1 : 2;
    }
    if (!edge) {
      stats.indices += 6;
    }
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
    closeLoop: boolean,
  ): [number, number] {
    if (!edge) {
      const currentIndex = arrayIndex / vertexSize;
      elementArrayIndex = this._writeIndices(
        elementArrayBuffer,
        elementArrayIndex,
        currentIndex - 2,
        closeLoop ? firstArrayIndex / vertexSize : currentIndex,
      );
    }
    if (!closeLoop) {
      arrayIndex = this._writeVertices(
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        vertexSize,
        edge,
        this.dest,
      );
    }
    return [arrayIndex, elementArrayIndex];
  }
}

class ArcTo extends PathCommand {
  radius: number;

  constructor(dest: Vector2, radius: number, attributes: ?VertexAttributes) {
    super(dest, attributes);
    this.radius = radius;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean,
    previous: ?PathCommand,
    closeLoop: boolean,
  ) {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    super.updateStats(stats, tessellation, edge, previous, closeLoop);
    const [length, divisions] = this._getArcParameters(tessellation, previous);
    if (!edge) {
      stats.indices += 6 * divisions;
    }
    stats.vertices += (edge ? 1 : 2) * (closeLoop ? divisions - 1 : divisions);
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
    closeLoop: boolean,
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
    let parameter = parameterIncrement;
    const point = {x: 0.0, y: 0.0};
    for (let ii = 0; ii < divisions; ii++) {
      const closing = closeLoop && ii === divisions - 1;
      if (!edge) {
        const currentIndex = arrayIndex / vertexSize;
        elementArrayIndex = this._writeIndices(
          elementArrayBuffer,
          elementArrayIndex,
          currentIndex - 2,
          closing ? firstArrayIndex / vertexSize : currentIndex,
        );
      }
      if (!closing) {
        const a = a0 + parameter * angle;
        point.x = center.x + this.radius * Math.cos(a);
        point.y = center.y + this.radius * Math.sin(a);
        arrayIndex = this._writeVertices(
          arrayBuffer,
          arrayIndex,
          attributeOffsets,
          vertexSize,
          edge,
          point,
          parameter,
          previous,
        );
      }
      parameter += parameterIncrement;
    }
    return [arrayIndex, elementArrayIndex];
  }

  _getDivisions(tessellation: number, previous: PathCommand): number {
    const height = distance(previous.dest, this.dest) / 2.0;
    const length =
      2.0 * this.radius * Math.asin(clamp(height / this.radius, -1.0, 1.0));
    return Math.ceil(length * tessellation);
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
    attributes: ?VertexAttributes,
  ) {
    super(dest, attributes);
    this.c1 = c1;
    this.c2 = c2;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean,
    previous: ?PathCommand,
    closeLoop: boolean,
  ) {
    if (!previous) {
      throw new Error('Missing previous command.');
    }
    super.updateStats(stats, tessellation, edge, previous, closeLoop);
    const [a, b, c, d, length, divisions] = this._getSplineParameters(
      tessellation,
      previous,
    );
    if (!edge) {
      stats.indices += 6 * divisions;
    }
    stats.vertices += (edge ? 1 : 2) * (closeLoop ? divisions - 1 : divisions);
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
    edge: boolean,
    firstArrayIndex: number,
    previous: ?PathCommand,
    closeLoop: boolean,
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
    let parameter = parameterIncrement;
    const point = {x: 0.0, y: 0.0};
    for (let ii = 0; ii < divisions; ii++) {
      const closing = closeLoop && ii === divisions - 1;
      if (!edge) {
        const currentIndex = arrayIndex / vertexSize;
        elementArrayIndex = this._writeIndices(
          elementArrayBuffer,
          elementArrayIndex,
          currentIndex - 2,
          closing ? firstArrayIndex / vertexSize : currentIndex,
        );
      }
      if (!closing) {
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
          arrayBuffer,
          arrayIndex,
          attributeOffsets,
          vertexSize,
          edge,
          point,
          parameter,
          previous,
        );
      }
      parameter += parameterIncrement;
    }
    return [arrayIndex, elementArrayIndex];
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
  }

  updateStats(stats: GeometryStats, tessellation: number) {
    let previousVertices = stats.vertices;
    this.exterior.updateStats(stats, tessellation, true);
    const exteriorVertices = stats.vertices - previousVertices;
    const triangles = exteriorVertices - 2;
    const indices = 3 * triangles;
    stats.indices += indices;
  }

  populateBuffers(
    arrayBuffer: Float32Array,
    elementArrayBuffer: Uint32Array,
    arrayIndex: number,
    elementArrayIndex: number,
    attributeOffsets: {[string]: number},
    vertexSize: number,
    tessellation: number,
  ): [number, number] {
    const firstIndex = arrayIndex / vertexSize;
    [arrayIndex, elementArrayIndex] = this.exterior.populateBuffers(
      arrayBuffer,
      elementArrayBuffer,
      arrayIndex,
      elementArrayIndex,
      attributeOffsets,
      vertexSize,
      tessellation,
      true,
    );
    const lastIndex = arrayIndex / vertexSize;
    const vertexCount = lastIndex - firstIndex;
    const vertexOffset = attributeOffsets.vertex;
    const p0 = {x: 0.0, y: 0.0};
    const p1 = {x: 0.0, y: 0.0};
    const p2 = {x: 0.0, y: 0.0};
    const v0 = {x: 0.0, y: 0.0};
    const v1 = {x: 0.0, y: 0.0};
    const convexIndices: Set<number> = new Set();
    const concaveIndices: Set<number> = new Set();
    for (let ii = 0; ii < vertexCount; ii++) {
      const i0 = firstIndex + ((ii + vertexCount - 1) % vertexCount);
      const i1 = firstIndex + ii;
      const i2 = firstIndex + ((ii + 1) % vertexCount);

      const a0 = i0 * vertexSize + vertexOffset;
      const a1 = i1 * vertexSize + vertexOffset;
      const a2 = i2 * vertexSize + vertexOffset;

      p0.x = arrayBuffer[a0];
      p0.y = arrayBuffer[a0 + 1];

      p1.x = arrayBuffer[a1];
      p1.y = arrayBuffer[a1 + 1];

      p2.x = arrayBuffer[a2];
      p2.y = arrayBuffer[a2 + 1];

      if (cross(minus(p2, p1, v0), minus(p0, p1, v1)) >= 0.0) {
        convexIndices.add(ii);
      } else {
        concaveIndices.add(ii);
      }
    }
    const plane = {normal: {x: 0.0, y: 0.0}, constant: 0.0};
    let remainingTriangles = vertexCount - 2;
    while (remainingTriangles > 0) {
      convexIndexLoop: for (const middle of convexIndices) {
        let left = middle;
        let right = middle;
        do {
          left = (left + vertexCount - 1) % vertexCount;
        } while (!(convexIndices.has(left) || concaveIndices.has(left)));
        do {
          right = (right + 1) % vertexCount;
        } while (!(convexIndices.has(left) || concaveIndices.has(left)));

        const i0 = firstIndex + left;
        const i1 = firstIndex + middle;
        const i2 = firstIndex + right;

        const a0 = i0 * vertexSize + vertexOffset;
        const a2 = i2 * vertexSize + vertexOffset;

        p0.x = arrayBuffer[a0];
        p0.y = arrayBuffer[a0 + 1];

        p2.x = arrayBuffer[a2];
        p2.y = arrayBuffer[a2 + 1];

        planeFromPoints(p0, p2, plane);

        for (const indices of [convexIndices, concaveIndices]) {
          for (const index of indices) {
            if (index === left || index === middle || index === right) {
              continue;
            }
            const a1 = index * vertexSize + vertexOffset;
            p1.x = arrayBuffer[a1];
            p1.y = arrayBuffer[a1 + 1];
            if (signedDistance(plane, p1) < 0.0) {
              continue convexIndexLoop; // not an ear
            }
          }
        }

        convexIndices.delete(middle);
        concaveIndices.delete(left);
        convexIndices.add(left);
        concaveIndices.delete(right);
        convexIndices.add(right);

        elementArrayBuffer[elementArrayIndex++] = i0;
        elementArrayBuffer[elementArrayIndex++] = i1;
        elementArrayBuffer[elementArrayIndex++] = i2;

        remainingTriangles--;
        break;
      }
    }
    return [arrayIndex, elementArrayIndex];
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
  attributes: VertexAttributes = {};

  _drawingPath: ?Path;

  constructor(shapes: Shape[] = [], paths: Path[] = []) {
    this.shapes = shapes;
    this.paths = paths;
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
  jump(x: number, y: number, attributes?: VertexAttributes): ShapeList {
    this.position.x = x;
    this.position.y = y;
    attributes && Object.assign(this.attributes, attributes);
    if (this._drawingPath) {
      this._drawingPath.lineTo(vec2(x, y), Object.assign({}, this.attributes));
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
  penUp(closeLoop: boolean = false): ShapeList {
    if (this._drawingPath) {
      this._drawingPath.loop = closeLoop;
      this._drawingPath = null;
    }
    return this;
  }

  /**
   * Creates the indexed triangle geometry for this shape list.
   *
   * @param tessellation the tessellation level.
   * @param thickness the thickness of the edges.
   * @return a tuple consisting of the array buffer (vertex data),
   * element array buffer (indices), and the attribute sizes.
   */
  createGeometry(
    tessellation: number,
    thickness: number,
  ): [Float32Array, Uint32Array, {[string]: number}] {
    // first pass: get stats
    const stats: GeometryStats = {
      attributeSizes: {vertex: 2, plane: 3},
      vertices: 0,
      indices: 0,
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

    // now we can allocate the buffers and populate them
    const arrayBuffer = new Float32Array(stats.vertices * vertexSize);
    const elementArrayBuffer = new Uint32Array(stats.indices);
    let arrayIndex = 0;
    let elementArrayIndex = 0;
    for (const shape of this.shapes) {
      [arrayIndex, elementArrayIndex] = shape.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        elementArrayIndex,
        attributeOffsets,
        vertexSize,
        tessellation,
      );
    }
    for (const path of this.paths) {
      [arrayIndex, elementArrayIndex] = path.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        elementArrayIndex,
        attributeOffsets,
        vertexSize,
        tessellation,
      );
    }
    return [arrayBuffer, elementArrayBuffer, stats.attributeSizes];
  }
}
