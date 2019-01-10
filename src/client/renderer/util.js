/**
 * Renderer utility functions.
 *
 * @module client/renderer/util
 * @flow
 */

import {RefCounted} from '../../server/store/resource';
import {vec2} from '../../server/store/math';
import type {Vector2, Bounds} from '../../server/store/math';
import {getColorArray} from '../../server/store/util';

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
   * Binds this program to its renderer.
   */
  bind() {
    this.renderer.bindProgram(this);
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
      this.bind();
      this.renderer.gl.uniform1f(this.getUniformLocation(name), value);
      this._uniformValues.set(name, value);
    }
  }

  /**
   * Sets the value of a uniform to a single integer.
   *
   * @param name the name of the uniform to set.
   * @param value the value to set.
   */
  setUniformInt(name: string, value: number) {
    if (this._uniformValues.get(name) !== value) {
      this.bind();
      this.renderer.gl.uniform1i(this.getUniformLocation(name), value);
      this._uniformValues.set(name, value);
    }
  }

  /**
   * Sets the value of a uniform to a vector.
   *
   * @param name the name of the uniform to set.
   * @param value the value to set.
   */
  setUniformVector(name: string, value: Vector2) {
    if (this._uniformValues.get(name) !== value) {
      this.bind();
      this.renderer.gl.uniform2f(
        this.getUniformLocation(name),
        value.x,
        value.y,
      );
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
    if (key === undefined) {
      key = (null: any); // can't use undefined as key
    }
    if (this._uniformValues.get(name) !== key) {
      this.bind();
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
   * @param [content] the value or value generator.  If omitted, use the key.
   */
  setUniformMatrix<T>(
    name: string,
    key: T,
    content?: ValueArray | (T => ValueArray),
  ) {
    if (key === undefined) {
      key = (null: any); // can't use undefined as key
    }
    if (this._uniformValues.get(name) !== key) {
      this.bind();
      if (!content) {
        content = (key: any);
      }
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

type ElementArrayBufferDataSource = Uint16Array | Uint32Array;

/**
 * A basic geometry wrapper.
 *
 * @param array the array of vertex data.
 * @param elementArray the array of indices.
 */
export class Geometry extends RefCounted {
  _array: BufferDataSource;
  _elementArray: ElementArrayBufferDataSource;
  _attributeSizes: {[string]: number};
  _stride = 0;
  _renderers: Set<Renderer> = new Set();

  constructor(
    array: BufferDataSource,
    elementArray: ElementArrayBufferDataSource,
    attributeSizes: {[string]: number},
  ) {
    super();
    this._array = array;
    this._elementArray = elementArray;
    this._attributeSizes = attributeSizes;
    for (const name in attributeSizes) {
      this._stride += attributeSizes[name] * 4;
    }
  }

  /**
   * Draws the geometry with the supplied program.
   *
   * @param program the program to use to draw the geometry.
   */
  draw(program: Program) {
    const renderer = program.renderer;
    this._renderers.add(renderer);
    renderer.bindProgram(program);
    renderer.bindArrayBuffer(renderer.getArrayBuffer(this, this._array));
    renderer.bindElementArrayBuffer(
      renderer.getElementArrayBuffer(this, this._elementArray),
    );
    const gl = renderer.gl;
    let offset = 0;
    const vertexAttribArraysEnabled: Set<number> = new Set();
    for (const name in this._attributeSizes) {
      const size = this._attributeSizes[name];
      const location = program.getAttribLocation(name);
      if (location !== -1) {
        vertexAttribArraysEnabled.add(location);
        gl.vertexAttribPointer(
          location,
          size,
          gl.FLOAT,
          false,
          this._stride,
          offset,
        );
      }
      offset += size * 4;
    }
    renderer.setVertexAttribArraysEnabled(vertexAttribArraysEnabled);
    gl.drawElements(
      gl.TRIANGLES,
      this._elementArray.length,
      this._elementArray instanceof Uint32Array
        ? gl.UNSIGNED_INT
        : gl.UNSIGNED_SHORT,
      0,
    );
  }

  _dispose() {
    for (const renderer of this._renderers) {
      renderer.clearArrayBuffer(this);
      renderer.clearElementArrayBuffer(this);
    }
    this._renderers = new Set();
  }
}

/**
 * A reference-counted texture.
 */
export class Texture extends RefCounted {
  _width: ?number;
  _height: ?number;
  _renderers: Set<Renderer> = new Set();

  /** Returns the width of the texture, if initialized. */
  get width(): ?number {
    return this._width;
  }

  /** Returns the height of the texture, if initialized. */
  get height(): ?number {
    return this._height;
  }

  /**
   * (Re)creates the texture with the specified dimensions.
   *
   * @param renderer the renderer to use.
   * @param width the texture width.
   * @param height the texture height.
   */
  setSize(renderer: Renderer, width: number, height: number) {
    this._width = width;
    this._height = height;
    renderer.bindTexture(this.get(renderer));
    const gl = renderer.gl;
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      width,
      height,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      null,
    );
    renderer.bindTexture(null);
  }

  /**
   * Returns the actual WebGL texture, creating it if necessary.
   *
   * @param renderer the renderer to use.
   * @return the texture object.
   */
  get(renderer: Renderer): WebGLTexture {
    this._renderers.add(renderer);
    return renderer.getTexture(this, this._create);
  }

  _create = (renderer: Renderer) => {
    const gl = renderer.gl;
    const texture = gl.createTexture();
    renderer.bindTexture(texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    renderer.bindTexture(null);
    return texture;
  };

  _dispose() {
    for (const renderer of this._renderers) {
      renderer.clearTexture(this);
    }
    this._renderers = new Set();
  }
}

/**
 * A reference-counted framebuffer.
 *
 * @param texture the texture to render to.
 */
export class Framebuffer extends RefCounted {
  /** Used by the minimap renderer to store the total bounds. */
  bounds: ?Bounds;

  /** Used by the minimap renderer to store the window bounds. */
  windowBounds: ?Bounds;

  _texture: Texture;
  _renderers: Set<Renderer> = new Set();

  /** Returns a reference to the framebuffer texture. */
  get texture(): Texture {
    return this._texture;
  }

  constructor(texture: Texture) {
    super();
    this._texture = texture;
  }

  /**
   * Returns the actual WebGL framebuffer, creating it if necessary.
   *
   * @param renderer the renderer to use.
   * @return the framebuffer object.
   */
  get(renderer: Renderer): WebGLFramebuffer {
    this._renderers.add(renderer);
    return renderer.getFramebuffer(this, this._create);
  }

  _create = (renderer: Renderer) => {
    const gl = renderer.gl;
    const framebuffer = gl.createFramebuffer();
    renderer.bindFramebuffer(framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this._texture.get(renderer),
      0,
    );
    renderer.bindFramebuffer(null);
    return framebuffer;
  };

  _init() {
    this._texture.ref();
  }

  _dispose() {
    this._texture.deref();
    for (const renderer of this._renderers) {
      renderer.clearFramebuffer(this);
    }
    this._renderers = new Set();
  }
}

export type Camera = {x: number, y: number, size: number, aspect: number};
export type Viewport = {x: number, y: number, width: number, height: number};

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
  elementIndexUint: boolean;
  arrayBuffers: Map<mixed, WebGLBuffer> = new Map();
  elementArrayBuffers: Map<mixed, WebGLBuffer> = new Map();
  vertexShaders: Map<mixed, WebGLShader> = new Map();
  fragmentShaders: Map<mixed, WebGLShader> = new Map();
  programs: Map<mixed, Program> = new Map();
  textures: Map<mixed, WebGLTexture> = new Map();
  framebuffers: Map<mixed, WebGLFramebuffer> = new Map();
  levelOfDetail = 1.0 / 8.0;

  fontTexture: WebGLTexture;

  mouseOffsetPosition: ?Vector2;
  mouseWorldPosition: ?Vector2;

  _renderCallbacks: [(Renderer) => void, number][] = [];
  _frameDirty = false;
  _lastFrameTime = 0;
  _frameDurations: number[] = [];
  _frameDurationTotal = 0;
  _frameDurationIndex = 0;

  _boundArrayBuffer: ?WebGLBuffer;
  _boundElementArrayBuffer: ?WebGLBuffer;
  _boundProgram: ?Program;
  _boundTexture: ?WebGLTexture;
  _boundFramebuffer: ?WebGLFramebuffer;
  _vertexAttribArraysEnabled: Set<number> = new Set();
  _capsEnabled: Set<number> = new Set();
  _blendFunc: {sfactor?: number, dfactor?: number} = {};
  _clearColor: ?string;
  _viewport: Viewport = {x: 0.0, y: 0.0, width: 0.0, height: 0.0};
  _scissor: Viewport = {x: 0.0, y: 0.0, width: 0.0, height: 0.0};
  _camera: Camera = {x: 0.0, y: 0.0, size: 1.0, aspect: 1.0};

  /** Returns a reference to the viewport state. */
  get viewport(): Viewport {
    return this._viewport;
  }

  /** Returns a reference to the camera state. */
  get camera(): Camera {
    return this._camera;
  }

  /** Returns the ratio of pixels to world units. */
  get pixelsToWorldUnits(): number {
    return this._camera.size / this.canvas.clientHeight;
  }

  /** Returns an estimate of the FPS rate. */
  get framesPerSecond(): number {
    return this._frameDurationTotal === 0.0
      ? 0.0
      : (this._frameDurations.length * 1000) / this._frameDurationTotal;
  }

  constructor(canvas: HTMLCanvasElement, fontImage: HTMLImageElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {alpha: false, depth: false});
    if (!gl) {
      throw new Error('Failed to create WebGL context.');
    }
    this.gl = gl;
    this.elementIndexUint = !!gl.getExtension('OES_element_index_uint');

    // only one blend function at the moment
    this.setBlendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // load the font image
    this.bindTexture((this.fontTexture = gl.createTexture()));
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      fontImage,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.generateMipmap(gl.TEXTURE_2D);

    canvas.addEventListener('mouseenter', this._onMouseMove);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  /**
   * Sets the canvas dimensions.
   *
   * @param width the width to use.
   * @param height the height to use.
   */
  setCanvasSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
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
    for (const texture of this.textures.values()) {
      this.gl.deleteTexture(texture);
    }
    for (const framebuffer of this.framebuffers.values()) {
      this.gl.deleteFramebuffer(framebuffer);
    }
    this.gl.deleteTexture(this.fontTexture);
    this._frameDirty = false;

    this.canvas.removeEventListener('mouseenter', this._onMouseMove);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
  }

  _onMouseMove = (event: MouseEvent) => {
    this.mouseOffsetPosition = vec2(
      event.offsetX,
      event.offsetY,
      this.mouseOffsetPosition,
    );
    this._updateMouseWorldPosition();
  };

  _updateMouseWorldPosition() {
    if (this.mouseOffsetPosition) {
      this.mouseWorldPosition = this.getWorldPosition(
        this.mouseOffsetPosition.x,
        this.mouseOffsetPosition.y,
        this.mouseWorldPosition,
      );
    }
  }

  _onMouseLeave = (event: MouseEvent) => {
    this.mouseOffsetPosition = null;
    this.mouseWorldPosition = null;
  };

  /**
   * Returns the world position corresponding to an event position.
   *
   * @param clientX the x coordinate relative to the window.
   * @param clientY the y coordinate relative to the window.
   * @param [result] an optional vector to hold the result.  If not given, a
   * new vector will be created.
   * @return the world position of the event.
   */
  getEventPosition(
    clientX: number,
    clientY: number,
    result?: ?Vector2,
  ): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return this.getWorldPosition(
      Math.round(clientX) - Math.round(rect.left),
      Math.round(clientY) - Math.round(rect.top),
      result,
    );
  }

  /**
   * Returns the world position corresponding to the specified pixel coords.
   *
   * @param offsetX the x coordinate relative to the canvas.
   * @param offsetY the y coordinate relative to the canvas.
   * @param [result] an optional vector to hold the result.  If not given, a
   * new vector will be created.
   * @return the result vector.
   */
  getWorldPosition(
    offsetX: number,
    offsetY: number,
    result?: ?Vector2,
  ): Vector2 {
    const camera = this._camera;
    const canvas = this.canvas;
    const x =
      camera.x +
      (offsetX / canvas.clientWidth - 0.5) * camera.size * camera.aspect;
    const y = camera.y + (0.5 - offsetY / canvas.clientHeight) * camera.size;
    if (!result) {
      return {x, y};
    }
    result.x = x;
    result.y = y;
    return result;
  }

  /**
   * Gets the pixel coords corresponding to the given world position.
   *
   * @param position the position to convert.
   * @return [result] an optional result vector to hold the result.  If not
   * given, a new vector will be created.
   * @return the result vector.
   */
  getCanvasPosition(position: Vector2, result?: Vector2): Vector2 {
    const x =
      this.canvas.clientWidth *
      ((position.x - this.camera.x) / (this.camera.size * this.camera.aspect) +
        0.5);
    const y =
      this.canvas.clientHeight *
      ((this.camera.y - position.y) / this.camera.size + 0.5);
    if (!result) {
      return {x, y};
    }
    result.x = x;
    result.y = y;
    return result;
  }

  /**
   * Finds the bounds of the camera in world space.
   *
   * @param [result] optional bounds to hold the result.  If not given, new
   * bounds will be created.
   * @return the result bounds.
   */
  getCameraBounds(result?: Bounds): Bounds {
    const camera = this._camera;
    const halfHeight = camera.size * 0.5;
    const halfWidth = halfHeight * camera.aspect;
    if (!result) {
      return {
        min: vec2(camera.x - halfWidth, camera.y - halfHeight),
        max: vec2(camera.x + halfWidth, camera.y + halfHeight),
      };
    }
    vec2(camera.x - halfWidth, camera.y - halfHeight, result.min);
    vec2(camera.x + halfWidth, camera.y + halfHeight, result.max);
    return result;
  }

  /**
   * Requests that the renderer render a frame at the earliest opportunity.
   * To be called when we need to update but aren't changing the store state
   * (as with tool helpers).
   */
  requestFrameRender() {
    if (this._frameDirty) {
      return;
    }
    this._frameDirty = true;
    requestAnimationFrame(() => {
      this._frameDirty && this.renderFrame();
    });
  }

  /**
   * Adds a render callback to the list.
   *
   * @param callback the callback to add.
   * @param [order=0] the order in which to invoke the callback.  Callbacks
   * are invoked in increasing order.
   */
  addRenderCallback(callback: Renderer => void, order: number = 0) {
    for (let ii = 0; ii < this._renderCallbacks.length; ii++) {
      const [otherCallback, otherOrder] = this._renderCallbacks[ii];
      if (order < otherOrder) {
        this._renderCallbacks.splice(ii, 0, [callback, order]);
        return;
      }
    }
    this._renderCallbacks.push([callback, order]);
  }

  /**
   * Removes a render callback from the list.
   *
   * @param callback the callback to remove.
   */
  removeRenderCallback(callback: Renderer => void) {
    for (let ii = 0; ii < this._renderCallbacks.length; ii++) {
      const [otherCallback, otherOrder] = this._renderCallbacks[ii];
      if (otherCallback === callback) {
        this._renderCallbacks.splice(ii, 1);
      }
    }
  }

  /**
   * Renders a frame by calling all of our render callbacks in order.
   */
  renderFrame() {
    const frameTime = Date.now();
    const duration = frameTime - this._lastFrameTime;
    if (duration < 500) {
      this._frameDurationTotal += duration;
      if (this._frameDurations.length < 60) {
        this._frameDurations.push(duration);
      } else {
        this._frameDurationTotal -= this._frameDurations[
          this._frameDurationIndex
        ];
        this._frameDurations[this._frameDurationIndex] = duration;
        this._frameDurationIndex =
          (this._frameDurationIndex + 1) % this._frameDurations.length;
      }
    }
    this._lastFrameTime = frameTime;

    // clear the dirty flag first so that callbacks can request another frame
    this._frameDirty = false;
    for (const [callback, order] of this._renderCallbacks) {
      callback(this);
    }
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
    return this._getBuffer(
      this.arrayBuffers,
      this.gl.ARRAY_BUFFER,
      key,
      content,
    );
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
    return this._getBuffer(
      this.elementArrayBuffers,
      this.gl.ELEMENT_ARRAY_BUFFER,
      key,
      content,
    );
  }

  _getBuffer<T>(
    buffers: Map<mixed, WebGLBuffer>,
    target: number,
    key: T,
    content: BufferDataSource | (T => BufferDataSource),
  ): WebGLBuffer {
    let buffer = buffers.get(key);
    if (!buffer) {
      buffers.set(key, (buffer = this.gl.createBuffer()));
      target === this.gl.ARRAY_BUFFER
        ? this.bindArrayBuffer(buffer)
        : this.bindElementArrayBuffer(buffer);
      this.gl.bufferData(
        target,
        typeof content === 'function' ? content(key) : content,
        this.gl.STATIC_DRAW,
      );
    }
    return buffer;
  }

  /**
   * Removes an array buffer from the map and deletes it.
   *
   * @param key the array buffer key.
   */
  clearArrayBuffer(key: mixed) {
    this._clearBuffer(this.arrayBuffers, key);
  }

  /**
   * Removes an element array buffer from the map and deletes it.
   *
   * @param key the element array buffer key.
   */
  clearElementArrayBuffer(key: mixed) {
    this._clearBuffer(this.elementArrayBuffers, key);
  }

  _clearBuffer(buffers: Map<mixed, WebGLBuffer>, key: mixed) {
    const buffer = buffers.get(key);
    if (buffer) {
      buffers.delete(key);
      this.gl.deleteBuffer(buffer);
    }
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
   * Binds a texture.
   *
   * @param texture the texture to bind.
   */
  bindTexture(texture: ?WebGLTexture) {
    if (this._boundTexture !== texture) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this._boundTexture = texture;
    }
  }

  /**
   * Binds a framebuffer.
   *
   * @param framebuffer the framebuffer to bind.
   */
  bindFramebuffer(framebuffer: ?WebGLFramebuffer) {
    if (this._boundFramebuffer !== framebuffer) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
      this._boundFramebuffer = framebuffer;
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
   * Retrieves a texture through the cache.
   *
   * @param key the texture key.
   * @param create the function to use to create the texture.
   * @return the texture object.
   */
  getTexture<T>(key: T, create: (Renderer, T) => WebGLTexture): WebGLTexture {
    let texture = this.textures.get(key);
    if (!texture) {
      this.textures.set(key, (texture = create(this, key)));
    }
    return texture;
  }

  /**
   * Retrieves a framebuffer through the cache.
   *
   * @param key the framebuffer key.
   * @param create the function to use to create the framebuffer.
   * @return the framebuffer object.
   */
  getFramebuffer<T>(
    key: T,
    create: (Renderer, T) => WebGLFramebuffer,
  ): WebGLFramebuffer {
    let framebuffer = this.framebuffers.get(key);
    if (!framebuffer) {
      this.framebuffers.set(key, (framebuffer = create(this, key)));
    }
    return framebuffer;
  }

  /**
   * Removes a texture from the map and deletes it.
   *
   * @param key the texture key.
   */
  clearTexture(key: mixed) {
    const texture = this.textures.get(key);
    if (texture) {
      this.textures.delete(key);
      this.gl.deleteTexture(texture);
    }
  }

  /**
   * Removes a framebuffer from the map and deletes it.
   *
   * @param key the framebuffer key.
   */
  clearFramebuffer(key: mixed) {
    const framebuffer = this.framebuffers.get(key);
    if (framebuffer) {
      this.framebuffers.delete(key);
      this.gl.deleteFramebuffer(framebuffer);
    }
  }

  /**
   * Sets the enabled set of vertex attribute arrays.
   *
   * @param locations the set of locations to enable.
   */
  setVertexAttribArraysEnabled(locations: Set<number>) {
    for (const location of locations) {
      if (!this._vertexAttribArraysEnabled.has(location)) {
        this.gl.enableVertexAttribArray(location);
      }
    }
    for (const location of this._vertexAttribArraysEnabled) {
      if (!locations.has(location)) {
        this.gl.disableVertexAttribArray(location);
      }
    }
    this._vertexAttribArraysEnabled = locations;
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
   * Sets the scissor parameters.
   *
   * @param x the x coordinate of the scissor region.
   * @param y the y coordinate of the scissor region.
   * @param width the width of the scissor region.
   * @param height the height of the scissor region.
   */
  setScissor(x: number, y: number, width: number, height: number) {
    if (
      this._scissor.x !== x ||
      this._scissor.y !== y ||
      this._scissor.width !== width ||
      this._scissor.height !== height
    ) {
      this.gl.scissor(x, y, width, height);
      this._scissor = {x, y, width, height};
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
      this._updateMouseWorldPosition();
    }
  }

  /**
   * Sets the clear color.
   *
   * @param color the color as a hex string.
   */
  setClearColor(color: string) {
    if (this._clearColor !== color) {
      const array = getColorArray((this._clearColor = color));
      this.gl.clearColor(array[0], array[1], array[2], 1.0);
    }
  }
}
