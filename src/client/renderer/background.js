/**
 * Background renderer.
 *
 * @module client/renderer/background
 * @flow
 */

import type {Renderer} from './util';

type BackgroundData = {color?: string, gridColor?: string};

const VERTEX_SHADER = `
  attribute vec2 vertex;
  void main(void) {
    gl_Position = vec4(vertex, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
   void main(void) {
    gl_FragColor = vec4(0.01, 0.01, 0.01, 1.0);
  }
`;

const ARRAY_BUFFER = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);

/**
 * Renders the background (base color, grid).
 *
 * @param renderer the renderer object.
 * @param data the background component data.
 */
export function renderBackground(
  renderer: Renderer,
  data: BackgroundData = {},
) {
  const program = renderer.getProgram(
    renderBackground,
    renderer.getVertexShader(renderBackground, VERTEX_SHADER),
    renderer.getFragmentShader(renderBackground, FRAGMENT_SHADER),
  );
  renderer.bindProgram(program);
  renderer.bindArrayBuffer(renderer.getBuffer(renderBackground, ARRAY_BUFFER));
  const attribLocation = program.getAttribLocation('vertex');
  renderer.enableVertexAttribArray(attribLocation);
  const gl = renderer.gl;
  gl.vertexAttribPointer(attribLocation, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}
