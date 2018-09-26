/**
 * Renderer utility functions.
 *
 * @module client/renderer/util
 * @flow
 */

/**
 * Converts a hex color string to an array of floats that we can use as a
 * uniform value.
 *
 * @param value the hex color string.
 * @return the corresponding array of floats.
 */
export function getColorArray(value: string): number[] {
  return [
    parseInt(value.substring(1, 3), 16) / 255.0,
    parseInt(value.substring(3, 5), 16) / 255.0,
    parseInt(value.substring(5, 7), 16) / 255.0,
  ];
}

type ValueArray = number[] | Float32Array;

/**
 * Wraps a WebGL program, keeping track of uniform locations.
 *
 * @param gl the WebGL context;
 * @param vertexShader the vertex shader to use for the program.
 * @param fragmentShader the fragment shader to use for the program.
 */
export class Program {
  gl: WebGLRenderingContext;
  program: WebGLProgram;

  _attribLocations: Map<string, number> = new Map();
  _uniformValues: Map<string, mixed> = new Map();
  _uniformLocations: Map<string, WebGLUniformLocation> = new Map();

  constructor(
    gl: WebGLRenderingContext,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
  ) {
    this.gl = gl;
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program));
    }
  }

  /**
   * Releases the resources associated with the program.
   */
  dispose() {
    this.gl.deleteProgram(this.program);
  }

  /**
   * Gets the location of an attribute through the cache.
   *
   * @param name the name of the attribute.
   * @return the attribute's location.
   */
  getAttribLocation(name: string): number {
    let location = this._attribLocations.get(name);
    if (location === undefined) {
      this._attribLocations.set(
        name,
        (location = this.gl.getAttribLocation(this.program, name)),
      );
    }
    return location;
  }

  /**
   * Sets a uniform from a hex color string.
   *
   * @param name the name of the uniform to set.
   * @param value the hex color string.
   */
  setUniformColor(name: string, value: string) {
    this.setUniformArray(name, value, getColorArray);
  }

  /**
   * Sets the value of a uniform to a single float.
   *
   * @param name the name of the uniform to set.
   * @param value the value to set.
   */
  setUniformFloat(name: string, value: number) {
    if (this._uniformValues.get(name) !== value) {
      this.gl.uniform1f(this.getUniformLocation(name), value);
      this._uniformValues.set(name, value);
    }
  }

  /**
   * Sets the value of a uniform to an array.
   *
   * @param name the name of the uniform to set.
   * @param key the value key.
   * @param content the value or value generator.
   */
  setUniformArray<T>(
    name: string,
    key: T,
    content: ValueArray | (T => ValueArray),
  ) {
    if (this._uniformValues.get(name) !== key) {
      const value = typeof content === 'function' ? content(key) : content;
      switch (value.length) {
        case 1:
          this.gl.uniform1fv(this.getUniformLocation(name), value);
          break;
        case 2:
          this.gl.uniform2fv(this.getUniformLocation(name), value);
          break;
        case 3:
          this.gl.uniform3fv(this.getUniformLocation(name), value);
          break;
        case 4:
          this.gl.uniform4fv(this.getUniformLocation(name), value);
          break;
        default:
          throw new Error('Invalid uniform array size: ' + value.length);
      }
      this._uniformValues.set(name, key);
    }
  }

  /**
   * Sets the value of a uniform to a matrix.
   *
   * @param name the name of the uniform to set.
   * @param key the value key.
   * @param content the value or value generator.
   */
  setUniformMatrix<T>(
    name: string,
    key: T,
    content: ValueArray | (T => ValueArray),
  ) {
    if (this._uniformValues.get(name) !== key) {
      const value = typeof content === 'function' ? content(key) : content;
      switch (value.length) {
        case 4:
          this.gl.uniformMatrix2fv(this.getUniformLocation(name), false, value);
          break;
        case 9:
          this.gl.uniformMatrix3fv(this.getUniformLocation(name), false, value);
          break;
        case 16:
          this.gl.uniformMatrix4fv(this.getUniformLocation(name), false, value);
          break;
        default:
          throw new Error('Invalid uniform matrix size: ' + value.length);
      }
      this._uniformValues.set(name, key);
    }
  }

  /**
   * Gets the location of a uniform through the cache.
   *
   * @param name the name of the uniform.
   * @return the uniform's location.
   */
  getUniformLocation(name: string): WebGLUniformLocation {
    let location = this._uniformLocations.get(name);
    if (location === undefined) {
      this._uniformLocations.set(
        name,
        (location = this.gl.getUniformLocation(this.program, name)),
      );
    }
    return location;
  }
}

export type Camera = {x: number, y: number, size: number, aspect: number};

/**
 * Minimal wrapper around GL context providing caching and state tracking.
 *
 * @param canvas the canvas in which to create the context.
 */
export class Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  buffers: Map<mixed, WebGLBuffer> = new Map();
  vertexShaders: Map<mixed, WebGLShader> = new Map();
  fragmentShaders: Map<mixed, WebGLShader> = new Map();
  programs: Map<mixed, Program> = new Map();

  _boundArrayBuffer: ?WebGLBuffer;
  _boundProgram: ?Program;
  _vertexAttribArraysEnabled: boolean[] = [];
  _viewport: {x?: number, y?: number, width?: number, height?: number} = {};
  _camera: Camera = {x: 0.0, y: 0.0, size: 1.0, aspect: 1.0};

  /** Returns a reference to the camera state. */
  get camera(): Camera {
    return this._camera;
  }

  /** Returns the ratio of pixels to world units. */
  get pixelsToWorldUnits(): number {
    return this._camera.size / this.canvas.clientHeight;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {alpha: false, depth: false});
    if (!gl) {
      throw new Error('Failed to create WebGL context.');
    }
    this.gl = gl;
  }

  /**
   * Releases the resources held by the renderer.
   */
  dispose() {
    for (const program of this.programs.values()) {
      program.dispose();
    }
    for (const shader of this.vertexShaders.values()) {
      this.gl.deleteShader(shader);
    }
    for (const shader of this.fragmentShaders.values()) {
      this.gl.deleteShader(shader);
    }
    for (const buffer of this.buffers.values()) {
      this.gl.deleteBuffer(buffer);
    }
  }

  /**
   * Retrieves a (static) buffer through the cache, creating/populating it if
   * necessary.
   *
   * @param key the cache key under which to look for the buffer.
   * @param content the buffer content or content generator.
   * @return the now-cached buffer.
   */
  getBuffer<T>(
    key: T,
    content: BufferDataSource | (T => BufferDataSource),
  ): WebGLBuffer {
    let buffer = this.buffers.get(key);
    if (!buffer) {
      this.buffers.set(key, (buffer = this.gl.createBuffer()));
      this.bindArrayBuffer(buffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        typeof content === 'function' ? content(key) : content,
        this.gl.STATIC_DRAW,
      );
    }
    return buffer;
  }

  /**
   * Binds an array buffer (or clears the binding).
   *
   * @param buffer the buffer to bind.
   */
  bindArrayBuffer(buffer: ?WebGLBuffer) {
    if (this._boundArrayBuffer !== buffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this._boundArrayBuffer = buffer;
    }
  }

  /**
   * Binds a program.
   *
   * @param program the program to bind.
   */
  bindProgram(program: Program) {
    if (this._boundProgram !== program) {
      this.gl.useProgram(program.program);
      this._boundProgram = program;
    }
  }

  /**
   * Retrieves a program through the cache, creating/linking it if necessary.
   *
   * @param key the cache key under which to look for the program.
   * @param vertexShader the vertex shader to use for the program.
   * @param fragmentShader the fragment shader to use for the program.
   * @return the now-cached program.
   */
  getProgram(
    key: mixed,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
  ): Program {
    let program = this.programs.get(key);
    if (!program) {
      this.programs.set(
        key,
        (program = new Program(this.gl, vertexShader, fragmentShader)),
      );
    }
    return program;
  }

  /**
   * Retrieves a vertex shader through the cache, creating/compiling it if
   * necessary.
   *
   * @param key the cache key under which to look for the shader.
   * @param content the shader source or source generator.
   * @return the now-cached shader.
   */
  getVertexShader<T>(key: T, content: string | (T => string)): WebGLShader {
    let shader = this.vertexShaders.get(key);
    if (!shader) {
      this.vertexShaders.set(
        key,
        (shader = this._createShader(this.gl.VERTEX_SHADER, key, content)),
      );
    }
    return shader;
  }

  /**
   * Retrieves a fragment shader through the cache, creating/compiling it if
   * necessary.
   *
   * @param key the cache key under which to look for the shader.
   * @param content the shader source or source generator.
   * @return the now-cached shader.
   */
  getFragmentShader<T>(key: T, content: string | (T => string)): WebGLShader {
    let shader = this.fragmentShaders.get(key);
    if (!shader) {
      this.fragmentShaders.set(
        key,
        (shader = this._createShader(this.gl.FRAGMENT_SHADER, key, content)),
      );
    }
    return shader;
  }

  _createShader<T>(
    type: number,
    key: T,
    content: string | (T => string),
  ): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(
      shader,
      typeof content === 'string' ? content : content(key),
    );
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  /**
   * Enables the vertex attribute array at the specified location.
   *
   * @param location the location to enable.
   */
  enableVertexAttribArray(location: number) {
    if (!this._vertexAttribArraysEnabled[location]) {
      this.gl.enableVertexAttribArray(location);
      this._vertexAttribArraysEnabled[location] = true;
    }
  }

  /**
   * Sets the viewport parameters.
   *
   * @param x the x coordinate of the viewport.
   * @param y the y coordinate of the viewport.
   * @param width the width of the viewport.
   * @param height the height of the viewport.
   */
  setViewport(x: number, y: number, width: number, height: number) {
    if (
      this._viewport.x !== x ||
      this._viewport.y !== y ||
      this._viewport.width !== width ||
      this._viewport.height !== height
    ) {
      this.gl.viewport(x, y, width, height);
      this._viewport = {x, y, width, height};
    }
  }

  /**
   * Sets the camera parameters.
   *
   * @param x the x coordinate of the camera position.
   * @param y the y coordinate of the camera position.
   * @param size the vertical size of the camera window.
   * @param aspect the camera window aspect ratio.
   */
  setCamera(x: number, y: number, size: number, aspect: number) {
    if (
      this._camera.x !== x ||
      this._camera.y !== y ||
      this._camera.size !== size ||
      this._camera.aspect !== aspect
    ) {
      this._camera = {x, y, size, aspect};
    }
  }
}
