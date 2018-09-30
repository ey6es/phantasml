/**
 * Shape renderer.
 *
 * @module client/renderer/shape
 * @flow
 */

import type {Vector2, Plane} from './math';
import {distance, clamp, minus, minusEquals, dot, mix} from './math';

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
    const divisions = this._getDivisions(tessellation, previous);
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
    const divisions = this._getDivisions(tessellation, previous);
    const parameterIncrement = 1.0 / divisions;
    let cx = 0.0;
    let cy = 0.0;
    let parameter = parameterIncrement;
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
        arrayIndex = this._writeVertices(
          arrayBuffer,
          arrayIndex,
          attributeOffsets,
          vertexSize,
          edge,
          {
            x: cx + this.radius * Math.cos(parameter),
            y: cy + this.radius * Math.sin(parameter),
          },
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
 * @param holes paths representing interior holes in the shape.
 */
class Shape {
  exterior: Path;
  holes: Path[];

  constructor(exterior: Path, ...holes: Path[]) {
    this.exterior = exterior;
    this.holes = holes;
  }

  updateStats(stats: GeometryStats, tessellation: number) {
    this.exterior.updateStats(stats, tessellation, true);
    for (const hole of this.holes) {
      hole.updateStats(stats, tessellation, true);
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
  ): [number, number] {
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
    for (const hole of this.holes) {
      [arrayIndex, elementArrayIndex] = hole.populateBuffers(
        arrayBuffer,
        elementArrayBuffer,
        arrayIndex,
        elementArrayIndex,
        attributeOffsets,
        vertexSize,
        tessellation,
        true,
      );
    }
    return [arrayIndex, elementArrayIndex];
  }
}

/**
 * A general collection of shapes and paths.
 *
 * @param shapes the shapes to include in the collection.
 * @param [paths] the paths to include in the collection, if any.
 */
class ShapeList {
  shapes: Shape[];
  paths: Path[];

  constructor(shapes: Shape[], paths: Path[] = []) {
    this.shapes = shapes;
    this.paths = paths;
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
