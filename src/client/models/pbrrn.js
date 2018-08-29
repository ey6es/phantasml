/**
 * Probabilistic binary rule reinforcement network.
 *
 * @module client/models/pbrrn
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
 * Options for the PBRRN model.
 */
export type PbrrnOptions = {
  width: number,
  height: number,
  probabilityLimit?: number,
  historyDecayRate?: number,
  disableSelfInputs?: boolean,
};

/**
 * Probabilistic binary rule reinforcement network.
 *
 * @param options the options for the model.
 * @param [canvas] an existing canvas to use rather than creating a new one.
 */
export class Pbrrn {
  /** The options provided to the constructor. */
  options: PbrrnOptions;

  /** The canvas we use for WebGL rendering. */
  canvas: HTMLCanvasElement;

  _gl: WebGLRenderingContext;
  _floatTextures: boolean;

  _probabilityLimit: number;
  _historyDecayRate: number;

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
  _swizzleShader: WebGLShader;
  _shaders: WebGLShader[] = [];

  _rewardProgram: WebGLProgram;
  _recordProgram: WebGLProgram;
  _transitionProgram: WebGLProgram;
  _outputProgram: WebGLProgram;
  _swizzleProgram: WebGLProgram;
  _programs: WebGLProgram[] = [];

  _rewardLocations: {
    reward: WebGLUniformLocation,
    probabilityLimit: WebGLUniformLocation,
  };
  _recordLocations: {
    probabilityLimit: WebGLUniformLocation,
    historyDecayRate: WebGLUniformLocation,
  };
  _transitionLocations: {
    probabilityLimit: WebGLUniformLocation,
  };
  _outputLocations: {
    uvScale: WebGLUniformLocation,
    uvOffset: WebGLUniformLocation,
  };
  _swizzleLocations: {
    uvScale: WebGLUniformLocation,
    uvOffset: WebGLUniformLocation,
  };

  constructor(options: PbrrnOptions, canvas?: ?HTMLCanvasElement) {
    this.options = options;
    this.canvas = canvas || (document.createElement('CANVAS'): any);
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    const gl: any = this.canvas.getContext('webgl', {
      alpha: false,
      depth: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('Failed to create WebGL context.');
    }
    this._gl = gl;
    this._floatTextures = !!gl.getExtension('OES_texture_float');

    // adjust alignment and make sure there's no color conversion
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    const DEFAULT_PROBABILITY_LIMIT = 6.0;
    this._probabilityLimit =
      options.probabilityLimit || DEFAULT_PROBABILITY_LIMIT;

    const DEFAULT_HISTORY_DECAY_RATE = 0.01;
    this._historyDecayRate =
      options.historyDecayRate || DEFAULT_HISTORY_DECAY_RATE;

    // the connection texture holds the addresses of each node's inputs
    {
      this._connectionTexture = gl.createTexture();
      this._textures.push(this._connectionTexture);
      gl.bindTexture(gl.TEXTURE_2D, this._connectionTexture);
      const data = new Uint8Array(options.width * options.height * 4);
      for (let yy = 0, ii = 0; yy < options.height; yy++) {
        const [v0, v1, v2, v3, v4, v5, v6, v7] =
          yy & 1
            ? [128, 0, 128, 255, 0, 128, 255, 128]
            : [0, 128, 255, 128, 128, 0, 128, 255];
        for (let xx = 0; xx < options.width; xx += 2) {
          data[ii++] = v0;
          data[ii++] = v1;
          data[ii++] = v2;
          data[ii++] = v3;

          if (xx + 1 < options.width) {
            data[ii++] = v4;
            data[ii++] = v5;
            data[ii++] = v6;
            data[ii++] = v7;
          }
        }
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        options.width,
        options.height,
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
    this._createProbabilityTexture(false);
    this._createProbabilityTexture(true);

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

    // vertex shader mostly just converts the vertices to uvs
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

    // fragment for defining the uv scale
    const UV_SCALE_SNIPPET = `
      const vec2 UV_SCALE = vec2(
        ${1.0 / options.width},
        ${1.0 / options.height}
      );
    `;

    this._rewardShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      #extension GL_EXT_draw_buffers : require
      precision highp float;
      uniform sampler2D history;
      uniform sampler2D probability;
      uniform float reward;
      uniform float probabilityLimit;
      ${UV_SCALE_SNIPPET}
      varying vec2 uv;
      void main(void) {
        // move probability based on reward and rule history
        vec2 historyOffset = UV_SCALE * vec2(0.0, 0.25);
        vec4 history0 = texture2D(history, uv - historyOffset);
        vec4 history1 = texture2D(history, uv + historyOffset);
        float probabilityLimit2 = probabilityLimit * 2.0;
        vec4 oldProbs =
          (texture2D(probability, uv) - vec4(0.5)) * probabilityLimit2;
        vec4 diffs =
          vec4(history0.yw, history1.yw) - vec4(history0.xz, history1.xz);
        vec4 sums =
          vec4(history0.yw, history1.yw) + vec4(history0.xz, history1.xz);
        
        // positive reward reinforces the rules we've been applying
        vec4 newProbs = oldProbs + max(reward, 0.0) * diffs;
        
        // negative reward ("punishment") causes a reversion to the center
        vec4 punishmentSums = min(reward, 0.0) * sums;
        newProbs +=
          max(-max(newProbs, 0.0), punishmentSums) -
          max(min(newProbs, 0.0), punishmentSums);
          
        // clamp to our limit so that we can "unlearn" reasonably rapidly
        gl_FragData[0] =
          clamp(newProbs, -probabilityLimit, probabilityLimit) /
          probabilityLimit2 + vec4(0.5);
      }
    `,
    );

    // snippet for determining the next state of the cell
    const NEXT_STATE_SNIPPET = `
      // use our input addresses to get the states of this cell and inputs
      vec4 connections = texture2D(connection, uv) * 2.0 - vec4(1.0);
      vec3 inputStates = vec3(
        ${options.disableSelfInputs ? '0.0' : 'texture2D(state, uv).r'},
        texture2D(state, uv + connections.st * UV_SCALE).r,
        texture2D(state, uv + connections.pq * UV_SCALE).r
      );
      // choose probability from the eight possible based on states
      vec2 probUv = (floor(uv / UV_SCALE) + vec2(0.5, 0.5)) * UV_SCALE;
      vec2 probOffset = UV_SCALE * vec2(0.25, 0.0);
      vec4 probs0 = texture2D(probability, probUv - probOffset);
      vec4 probs1 = texture2D(probability, probUv + probOffset);
      vec4 mixed0 = mix(
        vec4(probs0.xz, probs1.xz),
        vec4(probs0.yw, probs1.yw),
        inputStates.z
      );
      vec2 mixed1 = mix(mixed0.xz, mixed0.yw, inputStates.y);
      float mixed = mix(mixed1.x, mixed1.y, inputStates.x);
      float finalProb = (mixed - 0.5) * 2.0 * probabilityLimit;
      
      // apply the logistic function to turn raw value into prob. threshold
      float threshold = 1.0 / (1.0 + exp(-finalProb));
      
      // get a random value between zero and one from noise texture
      vec4 noiseValues = texture2D(noise, uv);
      float randomValue = dot(noiseValues, vec4(
        255.0 / 256.0,
        255.0 / (256.0 * 256.0),
        255.0 / (256.0 * 256.0 * 256.0),
        255.0 / (256.0 * 256.0 * 256.0)
      ));
      float nextState = step(randomValue, threshold);
    `;

    this._recordShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      #extension GL_EXT_draw_buffers : require
      precision highp float;
      uniform sampler2D connection;
      uniform sampler2D state;
      uniform sampler2D probability;
      uniform sampler2D history;
      uniform sampler2D noise;
      uniform float probabilityLimit;
      uniform float historyDecayRate;
      ${UV_SCALE_SNIPPET}
      varying vec2 uv;
      void main(void) {
        ${NEXT_STATE_SNIPPET}
        
        // use the input and next states to locate the history entry to update
        vec4 decision = vec4(inputStates, nextState);
        vec4 notDecision = vec4(1.0) - decision;
        vec4 history0 = vec4(
          notDecision.z * notDecision.w,
          notDecision.z * decision.w,
          decision.z * notDecision.w,
          decision.z * decision.w
        );
        vec2 location = step(vec2(0.5, 0.5), fract(uv / UV_SCALE));
        vec2 notLocation = vec2(1.0) - location;
        vec2 active = vec2(
          (decision.x * location.x) + (notDecision.x * notLocation.x),
          (decision.y * location.y) + (notDecision.y * notLocation.y)
        );
        // the decay rate controls how long historical decisions linger
        gl_FragData[0] = mix(
          texture2D(history, uv),
          active.x * active.y * history0,
          historyDecayRate
        );
      }
    `,
    );

    this._transitionShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      #extension GL_EXT_draw_buffers : require
      precision highp float;
      uniform sampler2D connection;
      uniform sampler2D state;
      uniform sampler2D probability;
      uniform sampler2D noise;
      uniform float probabilityLimit;
      ${UV_SCALE_SNIPPET}
      varying vec2 uv;
      void main(void) {
        ${NEXT_STATE_SNIPPET}
        gl_FragData[0] = vec4(nextState);
        
        ivec4 noiseInt = ivec4(noiseValues * 255.0);
        int seed = 256 * (256 * (256 * noiseInt.x + noiseInt.y) + noiseInt.z) +
          noiseInt.w;
        int nextSeed = (seed * 1664525 + 1013904223);
        gl_FragData[1] = fract(vec4(
          nextSeed / (256 * 256 * 256),
          (nextSeed * 256) / (256 * 256 * 256),
          (nextSeed * 256 * 256) / (256 * 256 * 256),
          (nextSeed * 256 * 256 * 256) / (256 * 256 * 256)
        ) / 255.0);
      }
    `,
    );

    // output shader simply renders the states to the frame buffer
    this._outputShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D state;
      uniform vec2 uvScale;
      uniform vec2 uvOffset;
      varying vec2 uv;
      void main(void) {
        gl_FragColor = texture2D(state, uv * uvScale + uvOffset);
      }
    `,
    );

    // swizzle shader is like output shader, but reverses RGBA order
    this._swizzleShader = this._createShader(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D state;
      uniform vec2 uvScale;
      uniform vec2 uvOffset;
      varying vec2 uv;
      void main(void) {
        gl_FragColor = texture2D(state, uv * uvScale + uvOffset).abgr;
      }
    `,
    );

    this._rewardProgram = this._createProgram(this._rewardShader, REWARD_UNITS);
    this._rewardLocations = {
      reward: gl.getUniformLocation(this._rewardProgram, 'reward'),
      probabilityLimit: gl.getUniformLocation(
        this._rewardProgram,
        'probabilityLimit',
      ),
    };

    this._recordProgram = this._createProgram(this._recordShader, RECORD_UNITS);
    this._recordLocations = {
      probabilityLimit: gl.getUniformLocation(
        this._recordProgram,
        'probabilityLimit',
      ),
      historyDecayRate: gl.getUniformLocation(
        this._recordProgram,
        'historyDecayRate',
      ),
    };

    this._transitionProgram = this._createProgram(
      this._transitionShader,
      TRANSITION_UNITS,
    );
    this._transitionLocations = {
      probabilityLimit: gl.getUniformLocation(
        this._transitionProgram,
        'probabilityLimit',
      ),
    };

    this._outputProgram = this._createProgram(this._outputShader, OUTPUT_UNITS);
    this._outputLocations = {
      uvScale: gl.getUniformLocation(this._outputProgram, 'uvScale'),
      uvOffset: gl.getUniformLocation(this._outputProgram, 'uvOffset'),
    };

    this._swizzleProgram = this._createProgram(
      this._swizzleShader,
      OUTPUT_UNITS,
    );
    this._swizzleLocations = {
      uvScale: gl.getUniformLocation(this._swizzleProgram, 'uvScale'),
      uvOffset: gl.getUniformLocation(this._swizzleProgram, 'uvOffset'),
    };
  }

  _createStateTexture(initialize: boolean) {
    const gl = this._gl;
    const texture = gl.createTexture();
    this._stateTextures.push(texture);
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    let data: ?Uint8Array = null;
    if (initialize) {
      data = new Uint8Array(this.options.width * this.options.height * 3);
      for (let ii = 0; ii < data.length; ) {
        const value = (Math.random() * INTEGER_MAX) | 0;
        for (let jj = 0; jj < 32 && ii < data.length; jj++) {
          const level = (value >> jj) & 0x01 ? 255 : 0;
          data[ii++] = level;
          data[ii++] = level;
          data[ii++] = level;
        }
      }
    }
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      this.options.width,
      this.options.height,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _createProbabilityTexture(initialize: boolean) {
    const gl = this._gl;
    const texture = gl.createTexture();
    this._probabilityTextures.push(texture);
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (this._floatTextures) {
      const data = new Float32Array(
        this.options.width * this.options.height * 2 * 4,
      );
      initialize && data.fill(0.5);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.options.width * 2,
        this.options.height,
        0,
        gl.RGBA,
        gl.FLOAT,
        data,
      );
    } else {
      const data = new Uint8Array(
        this.options.width * this.options.height * 2 * 4,
      );
      initialize && data.fill(128);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.options.width * 2,
        this.options.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
    }
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
      this.options.width * 2,
      this.options.height * 2,
      0,
      gl.RGBA,
      this._floatTextures ? gl.FLOAT : gl.UNSIGNED_BYTE,
      null,
    );
  }

  _createNoiseTexture(initialize: boolean) {
    const gl = this._gl;
    const texture = gl.createTexture();
    this._noiseTextures.push(texture);
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const data = new Uint8Array(this.options.width * this.options.height * 4);
    if (initialize) {
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
      this.options.width,
      this.options.height,
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
    const ext = gl.getExtension('WEBGL_draw_buffers');
    const buffer = gl.createFramebuffer();
    this._framebuffers.push(buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      ext.COLOR_ATTACHMENT0_WEBGL,
      gl.TEXTURE_2D,
      texture0,
      0,
    );
    const drawBuffers = [ext.COLOR_ATTACHMENT0_WEBGL];
    if (texture1) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        ext.COLOR_ATTACHMENT1_WEBGL,
        gl.TEXTURE_2D,
        texture1,
        0,
      );
      drawBuffers.push(ext.COLOR_ATTACHMENT1_WEBGL);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Framebuffer not complete: ' + status);
    }
    ext.drawBuffersWEBGL(drawBuffers);
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
    this.setStates(
      x,
      y,
      1,
      1,
      new Uint8Array(value ? [255, 255, 255, 255] : [0, 0, 0, 0]),
    );
  }

  /**
   * Sets a block of states within the system.
   *
   * @param x the x coordinate of the block.
   * @param y the y coordinate of the block.
   * @param width the width of the block.
   * @param height the height of the block.
   * @param buffer the buffer containing the states.  Should be in RGBA format
   * and thus at least width * height * 4 in size.
   */
  setStates(
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ) {
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._stateTextures[this._textureIndex]);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      x,
      y,
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buffer,
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
    const secondIndex = 1 - firstIndex;
    this._textureIndex = secondIndex;

    // apply the reward, updating probabilities based on history
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rewardBuffers[firstIndex]);
    gl.viewport(0, 0, this.options.width * 2, this.options.height);
    gl.useProgram(this._rewardProgram);
    gl.uniform1f(this._rewardLocations.reward, reward);
    gl.uniform1f(
      this._rewardLocations.probabilityLimit,
      this._probabilityLimit,
    );
    this._bindTexture(gl.TEXTURE0, this._historyTextures[secondIndex]);
    this._bindTexture(gl.TEXTURE1, this._probabilityTextures[secondIndex]);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // record the state transition that we're going to perform to history
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._recordBuffers[firstIndex]);
    gl.viewport(0, 0, this.options.width * 2, this.options.height * 2);
    gl.useProgram(this._recordProgram);
    gl.uniform1f(
      this._recordLocations.probabilityLimit,
      this._probabilityLimit,
    );
    gl.uniform1f(
      this._recordLocations.historyDecayRate,
      this._historyDecayRate,
    );
    this._bindTexture(gl.TEXTURE0, this._connectionTexture);
    this._bindTexture(gl.TEXTURE1, this._stateTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE2, this._probabilityTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE3, this._historyTextures[secondIndex]);
    this._bindTexture(gl.TEXTURE4, this._noiseTextures[firstIndex]);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // apply the actual transition and update the noise state
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._transitionBuffers[secondIndex]);
    gl.viewport(0, 0, this.options.width, this.options.height);
    gl.useProgram(this._transitionProgram);
    gl.uniform1f(
      this._transitionLocations.probabilityLimit,
      this._probabilityLimit,
    );
    this._bindTexture(gl.TEXTURE0, this._connectionTexture);
    this._bindTexture(gl.TEXTURE1, this._stateTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE2, this._probabilityTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE3, this._noiseTextures[firstIndex]);
    this._bindTexture(gl.TEXTURE4, null);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // render the states to the output so that we can sample them
    this.renderStateTexture();
  }

  /**
   * Retrieves the state of the system at the specified coordinates (i.e., get
   * the value of an output).
   *
   * @param x the x coordinate of interest.
   * @param y the y coordinate of interest.
   * @return the boolean state of the location.
   */
  getState(x: number, y: number): boolean {
    const buffer = new Uint8Array(4);
    this.getStates(x, y, 1, 1, buffer);
    return !!buffer[0];
  }

  /**
   * Retrieves a block of state data from the system.
   *
   * @param x the x coordinate of the block.
   * @param y the y coordinate of the block.
   * @param width the width of the block.
   * @param height the height of the block.
   * @param buffer the buffer in which to store the state.  Should be at least
   * of size width * height * 4, since the state is read as RGBA data.
   */
  getStates(
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ) {
    const gl = this._gl;
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
  }

  /**
   * Renders the connection texture to the canvas for debugging.
   *
   * @param swizzle if true, swizzle RGBA to ABGR.
   */
  renderConnectionTexture(swizzle: boolean) {
    this._renderTexture(this._connectionTexture, swizzle);
  }

  /**
   * Renders part of the probability texture to the canvas for debugging.
   *
   * @param swizzle if true, swizzle RGBA to ABGR.
   * @param offset the texture coordinate offset to use.
   */
  renderProbabilityTexture(swizzle: boolean, offset: number) {
    this._renderTexture(
      this._probabilityTextures[this._textureIndex],
      swizzle,
      0.5,
      1.0,
      offset,
      0.0,
    );
  }

  /**
   * Renders part of the history texture to the canvas for debugging.
   *
   * @param swizzle if true, swizzle RGBA to ABGR.
   * @param offsetS the texture coordinate offset to use on the S axis.
   * @param offsetT the texture coordinate offset to use on the T axis.
   */
  renderHistoryTexture(swizzle: boolean, offsetS: number, offsetT: number) {
    this._renderTexture(
      this._historyTextures[this._textureIndex],
      swizzle,
      0.5,
      0.5,
      offsetS,
      offsetT,
    );
  }

  /**
   * Renders the state texture to the canvas.
   */
  renderStateTexture() {
    this._renderTexture(this._stateTextures[this._textureIndex]);
  }

  _renderTexture(
    texture: WebGLTexture,
    swizzle: boolean = false,
    uvScaleS: number = 1.0,
    uvScaleT: number = 1.0,
    uvOffsetS: number = 0.0,
    uvOffsetT: number = 0.0,
  ) {
    const gl = this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (swizzle) {
      gl.useProgram(this._swizzleProgram);
      gl.uniform2f(this._swizzleLocations.uvScale, uvScaleS, uvScaleT);
      gl.uniform2f(this._swizzleLocations.uvOffset, uvOffsetS, uvOffsetT);
    } else {
      gl.useProgram(this._outputProgram);
      gl.uniform2f(this._outputLocations.uvScale, uvScaleS, uvScaleT);
      gl.uniform2f(this._outputLocations.uvOffset, uvOffsetS, uvOffsetT);
    }
    this._bindTexture(gl.TEXTURE0, texture);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  _bindTexture(unit: number, texture: ?WebGLTexture) {
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

type TextureVisualizerMode = 'connection' | 'probability' | 'history';

/**
 * Visualizes one of the model's textures.
 *
 * @param model the model to visualize.
 * @param mode the mode (the texture to visualize).
 * @param [swizzle=false] if true, render RGBA as ABGR so that we can visualize
 * alpha.
 * @param [canvas] an existing canvas to use rather than creating a new one.
 */
export class TextureVisualizer {
  /** The canvas upon which we render the texture. */
  canvas: HTMLCanvasElement;

  _ctx: CanvasRenderingContext2D;
  _model: Pbrrn;
  _mode: TextureVisualizerMode;
  _swizzle: boolean;

  constructor(
    model: Pbrrn,
    mode: TextureVisualizerMode,
    swizzle: boolean = false,
    canvas?: ?HTMLCanvasElement,
  ) {
    this.canvas = canvas || (document.createElement('CANVAS'): any);
    switch ((this._mode = mode)) {
      case 'probability':
        this.canvas.width = model.options.width * 2;
        this.canvas.height = model.options.height;
        break;

      case 'history':
        this.canvas.width = model.options.width * 2;
        this.canvas.height = model.options.height * 2;
        break;

      default:
        this.canvas.width = model.options.width;
        this.canvas.height = model.options.height;
        break;
    }
    this._ctx = this.canvas.getContext('2d', {alpha: false});
    this._ctx.imageSmoothingEnabled = false;
    this._model = model;
    this._swizzle = swizzle;
  }

  update() {
    try {
      switch (this._mode) {
        case 'probability':
          this._model.renderProbabilityTexture(this._swizzle, 0.0);
          this._ctx.drawImage(this._model.canvas, 0, 0);
          this._model.renderProbabilityTexture(this._swizzle, 0.5);
          this._ctx.drawImage(this._model.canvas, this._model.canvas.width, 0);
          break;

        case 'history':
          this._model.renderHistoryTexture(this._swizzle, 0.0, 0.0);
          this._ctx.drawImage(this._model.canvas, 0, this._model.canvas.height);
          this._model.renderHistoryTexture(this._swizzle, 0.5, 0.0);
          this._ctx.drawImage(
            this._model.canvas,
            this._model.canvas.width,
            this._model.canvas.height,
          );
          this._model.renderHistoryTexture(this._swizzle, 0.0, 0.5);
          this._ctx.drawImage(this._model.canvas, 0, 0);
          this._model.renderHistoryTexture(this._swizzle, 0.5, 0.5);
          this._ctx.drawImage(this._model.canvas, this._model.canvas.width, 0);
          break;

        default:
          this._model.renderConnectionTexture(this._swizzle);
          this._ctx.drawImage(this._model.canvas, 0, 0);
          break;
      }
    } finally {
      this._model.renderStateTexture();
    }
  }
}

type Point = {x: number, y: number};

/**
 * Visualizes the state of a system over time.
 *
 * @param model the model to visualize.
 * @param locations the locations of the states to visualize.
 * @param length the number of frames to visualize.
 * @param [fillStyle='#FFF'] the color with which to draw the states.
 * @param [backgroundStyle='#000'] the color with which to clear.
 * @param [canvas] an existing canvas to use rather than creating a new one.
 */
export class StateVisualizer {
  /** The canvas upon which we render the state history. */
  canvas: HTMLCanvasElement;

  /** The average states for each location over the window. */
  averageStates: number[] = [];

  _backCanvas: HTMLCanvasElement;
  _ctx: CanvasRenderingContext2D;
  _backCtx: CanvasRenderingContext2D;
  _model: Pbrrn;
  _locations: Point[];
  _length: number;
  _fillStyle: string;
  _backgroundStyle: string;

  _position = 0;

  _averages: {states: number[], sum: number}[] = [];

  constructor(
    model: Pbrrn,
    locations: Point[],
    length: number,
    fillStyle: string = '#FFF',
    backgroundStyle: string = '#000',
    canvas?: ?HTMLCanvasElement,
  ) {
    this.canvas = canvas || (document.createElement('CANVAS'): any);
    this._backCanvas = (document.createElement('CANVAS'): any);
    this.canvas.width = this._backCanvas.width = length;
    this.canvas.height = this._backCanvas.height = locations.length * 2 - 1;
    this._ctx = this.canvas.getContext('2d', {alpha: false});
    this._ctx.imageSmoothingEnabled = false;
    this._backCtx = this._backCanvas.getContext('2d', {alpha: false});
    this._model = model;
    this._locations = locations;
    this._length = length;
    this._fillStyle = fillStyle;
    this._backgroundStyle = backgroundStyle;

    // clear the initial back buffer
    this._backCtx.fillStyle = backgroundStyle;
    this._backCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // initialize the average values
    for (let ii = 0; ii < locations.length; ii++) {
      this.averageStates.push(0.0);
      this._averages.push({states: [], sum: 0.0});
    }
  }

  /**
   * Updates the visualizer based on the current state.
   */
  update() {
    // write the current state to the current position on the back canvas
    this._backCtx.fillStyle = this._backgroundStyle;
    this._backCtx.fillRect(this._position, 0, 1, this.canvas.height);
    this._backCtx.fillStyle = this._fillStyle;
    for (let ii = 0, yy = 0; ii < this._locations.length; ii++, yy += 2) {
      const location = this._locations[ii];
      const state = this._model.getState(location.x, location.y);
      if (state) {
        this._backCtx.fillRect(this._position, yy, 1, 1);
      }
      // update average
      const average = this._averages[ii];
      const stateValue = Number(state);
      average.states.push(stateValue);
      average.sum += stateValue;
      if (average.states.length > this._length) {
        average.sum -= average.states.shift();
      }
      this.averageStates[ii] = average.sum / average.states.length;
    }

    // draw the back canvas to the front in two parts to scroll
    const firstWidth = this._position + 1;
    this._ctx.drawImage(
      this._backCanvas,
      0,
      0,
      firstWidth,
      this.canvas.height,
      this.canvas.width - firstWidth,
      0,
      firstWidth,
      this.canvas.height,
    );
    const secondWidth = this.canvas.width - firstWidth;
    if (secondWidth > 0) {
      this._ctx.drawImage(
        this._backCanvas,
        this._position + 1,
        0,
        secondWidth,
        this.canvas.height,
        0,
        0,
        secondWidth,
        this.canvas.height,
      );
    }

    // the position loops around
    this._position = (this._position + 1) % this.canvas.width;
  }
}
