/**
 * Probabilistic spreading activation model.
 *
 * @module client/models/psa
 * @flow
 */

/**
 * Probabilistic spreading activation model.
 *
 * @param props.width the width of the state texture.
 * @param props.height the height of the state texture.
 */
export class Psa {
  _gl: WebGLRenderingContext;
  _width: number;
  _height: number;
  _connectionTexture: WebGLTexture;
  _stateTexture: WebGLTexture;
  _probabilityTexture: WebGLTexture;
  _historyTexture: WebGLTexture;
  _noiseTexture: WebGLTexture;

  constructor(width: number, height: number) {
    const canvas: HTMLCanvasElement = (document.createElement('CANVAS'): any);
    const gl = canvas.getContext('webgl');
    if (!gl) {
      throw new Error('Failed to create WebGL context.');
    }
    this._gl = gl;
    this._width = width;
    this._height = height;

    // the connection texture holds the addresses of each node's inputs
    {
      this._connectionTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._connectionTexture);
      const data = new Uint8Array(width * height * 4);
      for (let ii = 0; ii < data.length; ) {
        data[ii++] = 0;
        data[ii++] = 0;
        data[ii++] = 0;
        data[ii++] = 0;
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

    // the state texture holds the boolean node states
    {
      this._stateTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._stateTexture);
      const data = new Uint8Array(width * height);
      for (let ii = 0; ii < data.length; ii++) {
        data[ii] = 0;
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        width,
        height,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        data,
      );
    }

    // the probability texture holds the result probabilities
    {
      this._probabilityTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._probabilityTexture);
      const data = new Uint8Array(width * height * 4);
      for (let ii = 0; ii < data.length; ii++) {
        data[ii] = 0;
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

    // the history texture holds the decision history sums
    {
      this._historyTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._historyTexture);
      const data = new Uint8Array(width * 2 * height * 4);
      for (let ii = 0; ii < data.length; ii++) {
        data[ii] = 0;
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width * 2,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
    }

    // the noise texture holds the last randomly generated value
    {
      this._noiseTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._noiseTexture);
      const data = new Uint8Array(width * height * 4);
      for (let ii = 0; ii < data.length; ii++) {
        data[ii] = 0;
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
  }

  /**
   * Executes a simulation time step.
   */
  step() {}

  /**
   * Releases the resources held by the model.
   */
  dispose() {
    const gl = this._gl;
    gl.deleteTexture(this._connectionTexture);
    gl.deleteTexture(this._stateTexture);
    gl.deleteTexture(this._probabilityTexture);
    gl.deleteTexture(this._historyTexture);
    gl.deleteTexture(this._noiseTexture);
  }
}
