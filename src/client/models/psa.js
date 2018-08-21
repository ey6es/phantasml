/**
 * Probabilistic spreading activation model.
 *
 * @module client/models/psa
 * @flow
 */

const REWARD_UNITS = {
  history: 0,
  probability: 1,
};

const RECORD_UNITS = {
  connection: 0,
  state: 1,
  probability: 2,
  history: 3,
  noise: 4,
};

const TRANSITION_UNITS = {
  connection: 0,
  state: 1,
  probability: 2,
  noise: 3,
};

const OUTPUT_UNITS = {
  state: 0,
};

const INTEGER_MAX = Math.pow(2, 32);

/**
 * Probabilistic spreading activation model.
 *
 * @param props.width the width of the state texture (must be at least 8).
 * @param props.height the height of the state texture (must be at least 8).
 */
export class Psa {
  _gl: WebGLRenderingContext;
  _width: number;
  _height: number;
  _floatTextures: boolean;

  _connectionTexture: WebGLTexture;
  _stateTextures: WebGLTexture[] = [];
  _probabilityTextures: WebGLTexture[] = [];
  _historyTextures: WebGLTexture[] = [];
  _noiseTextures: WebGLTexture[] = [];
  _textures: WebGLTexture[] = [];

  _textureIndex = 0;

  _rewardBuffers: WebGLFramebuffer[] = [];
  _recordBuffers: WebGLFramebuffer[] = [];
  _transitionBuffers: WebGLFramebuffer[] = [];
  _framebuffers: WebGLFramebuffer[] = [];

  _buffer: WebGLBuffer;

  _vertexShader: WebGLShader;
  _rewardShader: WebGLShader;
  _recordShader: WebGLShader;
  _transitionShader: WebGLShader;
  _outputShader: WebGLShader;
  _shaders: WebGLShader[] = [];

  _rewardProgram: WebGLProgram;
  _recordProgram: WebGLProgram;
  _transitionProgram: WebGLProgram;
  _outputProgram: WebGLProgram;
  _programs: WebGLProgram[] = [];

  constructor(width: number, height: number) {
    const canvas: HTMLCanvasElement = (document.createElement('CANVAS'): any);
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext('webgl', {
      alpha: false,
      depth: false,
      antialias: false,
    });
    if (!gl) {
      throw new Error('Failed to create WebGL context.');
    }
    this._gl = gl;
    this._width = width;
    this._height = height;
    const extensions = gl.getSupportedExtensions();
    this._floatTextures =
      !!extensions && extensions.indexOf('OES_texture_float') !== -1;

    // the connection texture holds the addresses of each node's inputs
    {
      this._connectionTexture = gl.createTexture();
      this._textures.push(this._connectionTexture);
      gl.bindTexture(gl.TEXTURE_2D, this._connectionTexture);
      const data = new Uint8Array(width * height * 4);
      for (let yy = 0, ii = 0; yy < height; yy++) {
        let odd = yy & 1;
        let even = odd ^ 1;
        for (let xx = 0; xx < width; xx++) {
          data[ii++] = -even;
          data[ii++] = -odd;
          data[ii++] = even;
          data[ii++] = odd;

          data[ii++] = -odd;
          data[ii++] = -even;
          data[ii++] = odd;
          data[ii++] = even;
        }
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
    }

    // the state textures hold the boolean node states
    this._createStateTexture(true);
    this._createStateTexture(false);

    // the probability textures hold the result probabilities
    this._createProbabilityTexture();
    this._createProbabilityTexture();

    // the history textures hold the decision history sums
    this._createHistoryTexture();
    this._createHistoryTexture();

    // the noise textures hold the last randomly generated values
    this._createNoiseTexture(true);
    this._createNoiseTexture(false);

    // no linear resampling
    this._textures.forEach(texture => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    });

    this._rewardBuffers.push(
      this._createFramebuffer(this._probabilityTextures[0]),
      this._createFramebuffer(this._probabilityTextures[1]),
    );
    this._recordBuffers.push(
      this._createFramebuffer(this._historyTextures[0]),
      this._createFramebuffer(this._historyTextures[1]),
    );
    this._transitionBuffers.push(
      this._createFramebuffer(this._stateTextures[0], this._noiseTextures[0]),
      this._createFramebuffer(this._stateTextures[1], this._noiseTextures[1]),
    );

    // the buffer is a single quad
    {
      this._buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
      const data = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }

    this._vertexShader = this._createShader(
      gl.VERTEX_SHADER,
      `
      attribute vec2 vertex;
      varying vec2 uv;
      void main(void) {
        uv = vertex * 0.5 + vec2(0.5, 0.5);
        gl_Position = vec4(vertex, 0.0, 1.0);
      }
    `,
    );

    this._rewardShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D history;
      uniform sampler2D probability;
      uniform float reward;
      varying vec2 uv;
      void main(void) {
        gl_FragData[0] = vec4(0.0, 0.0, 0.0, 0.0);
      }
    `,
    );

    this._recordShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D connection;
      uniform sampler2D state;
      uniform sampler2D probability;
      uniform sampler2D history;
      uniform sampler2D noise;
      varying vec2 uv;
      void main(void) {
        gl_FragData[0] = vec4(0.0, 0.0, 0.0, 0.0);
      }
    `,
    );

    this._transitionShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D connection;
      uniform sampler2D state;
      uniform sampler2D probability;
      uniform sampler2D noise;
      varying vec2 uv;
      void main(void) {
        gl_FragData[0] = vec4(0.0, 0.0, 0.0, 0.0);
        gl_FragData[1] = vec4(0.0, 0.0, 0.0, 0.0);
      }
    `,
    );

    this._outputShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D state;
      varying vec2 uv;
      void main(void) {
        gl_FragColor = texture2D(state, uv);
      }
    `,
    );

    this._rewardProgram = this._createProgram(this._rewardShader, REWARD_UNITS);
    this._recordProgram = this._createProgram(this._recordShader, RECORD_UNITS);
    this._transitionProgram = this._createProgram(
      this._transitionShader,
      TRANSITION_UNITS,
    );
    this._outputProgram = this._createProgram(this._outputShader, OUTPUT_UNITS);
  }

  _createStateTexture(initialize: boolean) {
    const gl = this._gl;
    const texture = gl.createTexture();
    this._stateTextures.push(texture);
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    let data: ?Uint8Array;
    if (initialize) {
      data = new Uint8Array(this._width * this._height);
      for (let ii = 0; ii < data.length; ) {
        const value = (Math.random() * INTEGER_MAX) | 0;
        for (let jj = 0; jj < 32; jj++) {
          data[ii++] = (value >> jj) & 0x01 ? 255 : 0;
        }
      }
    }
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      this._width,
      this._height,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      data,
    );
  }

  _createProbabilityTexture() {
    const gl = this._gl;
    const texture = gl.createTexture();
    this._probabilityTextures.push(texture);
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this._width,
      this._height,
      0,
      gl.RGBA,
      this._floatTextures ? gl.FLOAT : gl.UNSIGNED_BYTE,
    );
  }

  _createHistoryTexture() {
    const gl = this._gl;
    const texture = gl.createTexture();
    this._historyTextures.push(texture);
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this._width * 2,
      this._height,
      0,
      gl.RGBA,
      this._floatTextures ? gl.FLOAT : gl.UNSIGNED_BYTE,
    );
  }

  _createNoiseTexture(initialize: boolean) {
    const gl = this._gl;
    const texture = gl.createTexture();
    this._noiseTextures.push(texture);
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    let data: ?Uint8Array;
    if (initialize) {
      data = new Uint8Array(this._width * this._height * 4);
      for (let ii = 0; ii < data.length; ) {
        const value = (Math.random() * INTEGER_MAX) | 0;
        data[ii++] = value & 0xff;
        data[ii++] = (value >> 8) & 0xff;
        data[ii++] = (value >> 16) & 0xff;
        data[ii++] = (value >> 24) & 0xff;
      }
    }
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this._width,
      this._height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
  }

  _createFramebuffer(
    texture0: WebGLTexture,
    texture1?: WebGLTexture,
  ): WebGLFramebuffer {
    const gl = this._gl;
    const buffer = gl.createFramebuffer();
    this._framebuffers.push(buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture0,
      0,
    );
    if (texture1) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + 1,
        gl.TEXTURE_2D,
        texture1,
        0,
      );
    }
    return buffer;
  }

  _createShader(type: number, source: string): WebGLShader {
    const gl = this._gl;
    const shader = gl.createShader(type);
    this._shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  _createProgram(
    fragmentShader: WebGLShader,
    units: {[string]: number},
  ): WebGLProgram {
    const gl = this._gl;
    const program = gl.createProgram();
    this._programs.push(program);
    gl.attachShader(program, this._vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);
    for (const unit in units) {
      gl.uniform1i(gl.getUniformLocation(program, unit), units[unit]);
    }
    return program;
  }

  /**
   * Sets the state of the system at the specified coordinates (i.e., set the
   * value of an input).
   *
   * @param x the x coordinate of interest.
   * @param y the y coordinate of interest.
   * @param value the value to set at the coordinates.
   */
  setState(x: number, y: number, value: boolean) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._stateTextures[this._textureIndex]);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      x,
      y,
      1,
      1,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      new Uint8Array([value ? 255 : 0]),
    );
  }

  /**
   * Executes a simulation time step.
   *
   * @param reward the amount of reward to grant.
   */
  step(reward: number) {
    const gl = this._gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    // alternate between texture indices each frame
    const firstIndex = this._textureIndex;
    const secondIndex = (firstIndex + 1) % 2;
    this._textureIndex = secondIndex;

    // apply the reward, updating probabilities based on history
    gl.useProgram(this._rewardProgram);
    this._bindTexture(gl.TEXTURE0, this._historyTextures[secondIndex]);
    this._bindTexture(gl.TEXTURE1, this._probabilityTextures[secondIndex]);
    gl.uniform1f(gl.getUniformLocation(this._rewardProgram, 'reward'), reward);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rewardBuffers[firstIndex]);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // record the state transition that we're going to perform to history
    gl.useProgram(this._recordProgram);
    this._bindTexture(gl.TEXTURE0, this._connectionTexture);
    this._bindTexture(gl.TEXTURE1, this._stateTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE2, this._probabilityTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE3, this._historyTextures[secondIndex]);
    this._bindTexture(gl.TEXTURE4, this._noiseTextures[firstIndex]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._recordBuffers[firstIndex]);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // apply the actual transition and update the noise state
    gl.useProgram(this._transitionProgram);
    this._bindTexture(gl.TEXTURE0, this._connectionTexture);
    this._bindTexture(gl.TEXTURE1, this._stateTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE2, this._probabilityTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE3, this._noiseTextures[firstIndex]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._transitionBuffers[secondIndex]);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // render the states to the output so that we can sample them
    gl.useProgram(this._outputProgram);
    this._bindTexture(gl.TEXTURE0, this._stateTextures[secondIndex]);
    gl.bindFramebuffer(gl.FRAMEBUFFER);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  /**
   * Retrieves the state of the system at the specified coordinates (i.e., get
   * the value of an output).  Only valid after the first step.
   *
   * @param x the x coordinate of interest.
   * @param y the y coordinate of interest.
   * @return the boolean state of the location.
   */
  getState(x: number, y: number): boolean {
    const gl = this._gl;
    const buffer = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    return !!buffer[0];
  }

  _bindTexture(unit: number, texture: WebGLTexture) {
    const gl = this._gl;
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  /**
   * Releases the resources held by the model.
   */
  dispose() {
    const gl = this._gl;
    this._framebuffers.forEach(buffer => gl.deleteFramebuffer(buffer));
    this._textures.forEach(texture => gl.deleteTexture(texture));
    gl.deleteBuffer(this._buffer);
    this._programs.forEach(program => gl.deleteProgram(program));
    this._shaders.forEach(shader => gl.deleteShader(shader));
  }
}
