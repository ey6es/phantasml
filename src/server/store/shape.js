/**
 * Shape renderer.
 *
 * @module client/renderer/shape
 * @flow
 */

import type {Vector2, Plane} from './math';

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
    this.commands.push(new CurveTo(dest, c1, c2, attributes));
    return this;
  }

  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean = false,
  ) {
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previousCommand: ?PathCommand;
      let closeLoop = false;
      if (this.loop || edge) {
        const lastIndex = this.commands.length - 1;
        previousCommand = this.commands[
          (ii + lastIndex) % this.commands.length
        ];
        closeLoop = ii === lastIndex;
      } else {
        previousCommand = this.commands[ii - 1];
      }
      command.updateStats(
        stats,
        tessellation,
        edge,
        previousCommand && previousCommand.dest,
        closeLoop,
      );
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
    for (let ii = 0; ii < this.commands.length; ii++) {
      const command = this.commands[ii];
      let previousCommand: ?PathCommand;
      let nextCommand: ?PathCommand;
      let closeLoop = false;
      if (this.loop || edge) {
        const lastIndex = this.commands.length - 1;
        previousCommand = this.commands[
          (ii + lastIndex) % this.commands.length
        ];
        nextCommand = this.commands[(ii + 1) % this.commands.length];
        closeLoop = ii === lastIndex;
      } else {
        previousCommand = this.commands[ii - 1];
        nextCommand = this.commands[ii + 1];
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
        previousCommand && previousCommand.dest,
        nextCommand && nextCommand.dest,
        closeLoop,
      );
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
    previous: ?Vector2,
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
    previous: ?Vector2,
    next: ?Vector2,
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
    vertex: Vector2,
    plane: Plane,
  ): number {
    let vertexIndex = arrayIndex + attributeOffsets.vertex;
    arrayBuffer[vertexIndex] = vertex.x;
    arrayBuffer[vertexIndex + 1] = vertex.y;
    let planeIndex = arrayIndex + attributeOffsets.plane;
    arrayBuffer[planeIndex] = plane.normal.x;
    arrayBuffer[planeIndex + 1] = plane.normal.y;
    arrayBuffer[planeIndex + 2] = plane.constant;
    this._writeAttributes(arrayBuffer, arrayIndex, attributeOffsets);
    arrayIndex += vertexSize;
    if (!edge) {
      vertexIndex = arrayIndex + attributeOffsets.vertex;
      arrayBuffer[vertexIndex] = vertex.x;
      arrayBuffer[vertexIndex + 1] = vertex.y;
      planeIndex = arrayIndex + attributeOffsets.plane;
      arrayBuffer[planeIndex] = -plane.normal.x;
      arrayBuffer[planeIndex + 1] = -plane.normal.y;
      arrayBuffer[planeIndex + 2] = -plane.constant;
      this._writeAttributes(arrayBuffer, arrayIndex, attributeOffsets);
      arrayIndex += vertexSize;
    }
    return arrayIndex;
  }

  _writeAttributes(
    arrayBuffer: Float32Array,
    arrayIndex: number,
    attributeOffsets: {[string]: number},
  ) {
    if (this.attributes) {
      for (const name in this.attributes) {
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

  _getPlane(previous: ?Vector2, current: Vector2, next: ?Vector2): Plane {
    return {normal: {x: 1.0, y: 0.0}, constant: 0.0};
  }
}

class MoveTo extends PathCommand {
  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean,
    previous: ?Vector2,
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
    previous: ?Vector2,
    next: ?Vector2,
    closeLoop: boolean,
  ): [number, number] {
    arrayIndex = this._writeVertices(
      arrayBuffer,
      arrayIndex,
      attributeOffsets,
      vertexSize,
      edge,
      this.dest,
      this._getPlane(previous, this.dest, next),
    );
    return [arrayIndex, elementArrayIndex];
  }
}

class LineTo extends PathCommand {
  updateStats(
    stats: GeometryStats,
    tessellation: number,
    edge: boolean,
    previous: ?Vector2,
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
    previous: ?Vector2,
    next: ?Vector2,
    closeLoop: boolean,
  ): [number, number] {
    if (!closeLoop) {
      arrayIndex = this._writeVertices(
        arrayBuffer,
        arrayIndex,
        attributeOffsets,
        vertexSize,
        edge,
        this.dest,
        this._getPlane(previous, this.dest, next),
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
    previous: ?Vector2,
    closeLoop: boolean,
  ) {
    super.updateStats(stats, tessellation, edge, previous, closeLoop);
    const divisions = 1 - (closeLoop ? 1 : 0);
    stats.vertices += (edge ? 1 : 2) * divisions;
    if (!edge) {
      stats.indices += 6 * divisions;
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
    previous: ?Vector2,
    next: ?Vector2,
    closeLoop: boolean,
  ): [number, number] {
    return [arrayIndex, elementArrayIndex];
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
    previous: ?Vector2,
    closeLoop: boolean,
  ) {
    super.updateStats(stats, tessellation, edge, previous, closeLoop);
    const divisions = 1 - (closeLoop ? 1 : 0);
    stats.vertices += (edge ? 1 : 2) * divisions;
    if (!edge) {
      stats.indices += 6 * divisions;
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
    previous: ?Vector2,
    next: ?Vector2,
    closeLoop: boolean,
  ): [number, number] {
    return [arrayIndex, elementArrayIndex];
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
    this.exterior.updateStats(stats, tessellation);
    for (const hole of this.holes) {
      hole.updateStats(stats, tessellation);
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
