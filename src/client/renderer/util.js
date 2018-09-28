/**
 * Renderer utility functions.
 *
 * @module client/renderer/util
 * @flow
 */

import type {Vector2} from '../util/math';

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
  renderer: Renderer;
  program: WebGLProgram;

  _attribLocations: Map<string, number> = new Map();
  _uniformValues: Map<string, mixed> = new Map();
  _uniformLocations: Map<string, WebGLUniformLocation> = new Map();

  constructor(
    renderer: Renderer,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
  ) {
    this.renderer = renderer;
    const gl = renderer.gl;
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
    this.renderer.gl.deleteProgram(this.program);
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
        (location = this.renderer.gl.getAttribLocation(this.program, name)),
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
      this.renderer.gl.uniform1f(this.getUniformLocation(name), value);
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
          this.renderer.gl.uniform1fv(this.getUniformLocation(name), value);
          break;
        case 2:
          this.renderer.gl.uniform2fv(this.getUniformLocation(name), value);
          break;
        case 3:
          this.renderer.gl.uniform3fv(this.getUniformLocation(name), value);
          break;
        case 4:
          this.renderer.gl.uniform4fv(this.getUniformLocation(name), value);
          break;
        default:
          throw new Error('Invalid uniform array size: ' + value.length);
      }
      this._uniformValues.set(name, key);
    }
  }

  /**
   * Sets the value of a uniform to the renderer's view-projection matrix.
   *
   * @param name the name of the uniform to set.
   */
  setUniformViewProjectionMatrix(name: string) {
    this.setUniformMatrix(name, this.renderer.camera, getViewProjectionMatrix);
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
          this.renderer.gl.uniformMatrix2fv(
            this.getUniformLocation(name),
            false,
            value,
          );
          break;
        case 9:
          this.renderer.gl.uniformMatrix3fv(
            this.getUniformLocation(name),
            false,
            value,
          );
          break;
        case 16:
          this.renderer.gl.uniformMatrix4fv(
            this.getUniformLocation(name),
            false,
            value,
          );
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
        (location = this.renderer.gl.getUniformLocation(this.program, name)),
      );
    }
    return location;
  }
}

/**
 * A basic geometry wrapper.
 */
export class Geometry {
  /**
   * Draws the geometry with the supplied program.
   *
   * @param program the program to use to draw the geometry.
   */
  draw(program: Program) {
    program.renderer.bindProgram(program);
  }

  /**
   * Releases the resources associated with this geometry.
   */
  dispose() {}
}

export type Camera = {x: number, y: number, size: number, aspect: number};

function getViewProjectionMatrix(camera: Camera): number[] {
  const halfSize = camera.size * 0.5;
  const scaleX = 1.0 / (halfSize * camera.aspect);
  const scaleY = 1.0 / halfSize;

  // prettier-ignore
  return [
    scaleX, 0.0, 0.0,
    0.0, scaleY, 0.0,
    -camera.x * scaleX, -camera.y * scaleY, 1.0,
  ];
}

/**
 * Minimal wrapper around GL context providing caching and state tracking.
 *
 * @param canvas the canvas in which to create the context.
 */
export class Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  arrayBuffers: Map<mixed, WebGLBuffer> = new Map();
  elementArrayBuffers: Map<mixed, WebGLBuffer> = new Map();
  vertexShaders: Map<mixed, WebGLShader> = new Map();
  fragmentShaders: Map<mixed, WebGLShader> = new Map();
  programs: Map<mixed, Program> = new Map();

  _renderCallbacks: ((Renderer) => void)[] = [];
  _frameDirty = false;

  _boundArrayBuffer: ?WebGLBuffer;
  _boundElementArrayBuffer: ?WebGLBuffer;
  _boundProgram: ?Program;
  _vertexAttribArraysEnabled: boolean[] = [];
  _capsEnabled: Set<number> = new Set();
  _blendFunc: {sfactor?: number, dfactor?: number} = {};
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

    // only one blend function at the moment
    this.setBlendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    for (const buffer of this.arrayBuffers.values()) {
      this.gl.deleteBuffer(buffer);
    }
    for (const buffer of this.elementArrayBuffers.values()) {
      this.gl.deleteBuffer(buffer);
    }
    this._frameDirty = false;
  }

  /**
   * Returns the world position corresponding to the specified pixel coords.
   *
   * @param offsetX the x coordinate relative to the canvas.
   * @param offsetY the y coordinate relative to the canvas.
   * @return the world position.
   */
  getWorldPosition(offsetX: number, offsetY: number): Vector2 {
    const camera = this._camera;
    const canvas = this.canvas;
    return {
      x:
        camera.x +
        (offsetX / canvas.clientWidth - 0.5) * camera.size * camera.aspect,
      y: camera.y + (0.5 - offsetY / canvas.clientHeight) * camera.size,
    };
  }

  /**
   * Requests that the renderer render a frame at the earliest opportunity.
   * To be called when we need to update but aren't changing the store state
   * (as with tool helpers).
   */
  requestFrameRender() {
    this._frameDirty = true;
    requestAnimationFrame(() => {
      this._frameDirty && this.renderFrame();
    });
  }

  /**
   * Adds a render callback to the list.
   *
   * @param callback the callback to add.
   */
  addRenderCallback(callback: Renderer => void) {
    this._renderCallbacks.push(callback);
  }

  /**
   * Removes a render callback from the list.
   *
   * @param callback the callback to remove.
   */
  removeRenderCallback(callback: Renderer => void) {
    const index = this._renderCallbacks.indexOf(callback);
    index === -1 || this._renderCallbacks.splice(index, 1);
  }

  /**
   * Renders a frame by calling all of our render callbacks in order.
   */
  renderFrame() {
    for (const callback of this._renderCallbacks) {
      callback(this);
    }
    this._frameDirty = false;
  }

  /**
   * Retrieves a (static) array buffer through the cache, creating/populating
   * it if necessary.
   *
   * @param key the cache key under which to look for the buffer.
   * @param content the buffer content or content generator.
   * @return the now-cached buffer.
   */
  getArrayBuffer<T>(
    key: T,
    content: BufferDataSource | (T => BufferDataSource),
  ): WebGLBuffer {
    return this._getBuffer(this.arrayBuffers, key, content);
  }

  /**
   * Retrieves a (static) element array buffer through the cache,
   * creating/populating it if necessary.
   *
   * @param key the cache key under which to look for the buffer.
   * @param content the buffer content or content generator.
   * @return the now-cached buffer.
   */
  getElementArrayBuffer<T>(
    key: T,
    content: BufferDataSource | (T => BufferDataSource),
  ): WebGLBuffer {
    return this._getBuffer(this.elementArrayBuffers, key, content);
  }

  _getBuffer<T>(
    buffers: Map<mixed, WebGLBuffer>,
    key: T,
    content: BufferDataSource | (T => BufferDataSource),
  ): WebGLBuffer {
    let buffer = buffers.get(key);
    if (!buffer) {
      buffers.set(key, (buffer = this.gl.createBuffer()));
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
   * Binds an element array buffer (or clears the binding).
   *
   * @param buffer the buffer to bind.
   */
  bindElementArrayBuffer(buffer: ?WebGLBuffer) {
    if (this._boundElementArrayBuffer !== buffer) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffer);
      this._boundElementArrayBuffer = buffer;
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
        (program = new Program(this, vertexShader, fragmentShader)),
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
   * Enables or disables a GL state capability.
   *
   * @param cap the capability to enable or disable.
   * @param enable whether or not to enable the capability.
   */
  setEnabled(cap: number, enable: boolean) {
    if (this._capsEnabled.has(cap) !== enable) {
      if (enable) {
        this.gl.enable(cap);
        this._capsEnabled.add(cap);
      } else {
        this.gl.disable(cap);
        this._capsEnabled.delete(cap);
      }
    }
  }

  /**
   * Sets the GL blend function parameters.
   *
   * @param sfactor the source blend factor.
   * @param dfactor the dest blend factor.
   */
  setBlendFunc(sfactor: number, dfactor: number) {
    if (
      this._blendFunc.sfactor !== sfactor ||
      this._blendFunc.dfactor !== dfactor
    ) {
      this.gl.blendFunc(sfactor, dfactor);
      this._blendFunc.sfactor = sfactor;
      this._blendFunc.dfactor = dfactor;
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
