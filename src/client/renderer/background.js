/**
 * Background renderer.
 *
 * @module client/renderer/background
 * @flow
 */

import {RendererComponents} from './components';
import {Geometry} from './util';
import type {Camera, Renderer, getColorArray} from './util';

type BackgroundData = {color?: string, gridColor?: string};

const VERTEX_SHADER = `
  uniform mat3 worldMatrix;
  attribute vec2 vertex;
  varying vec2 worldPosition;
  void main(void) {
    worldPosition = (worldMatrix * vec3(vertex, 1.0)).xy;
    gl_Position = vec4(vertex, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 color;
  uniform vec3 gridColor;
  uniform float pixelSize;
  varying vec2 worldPosition;
  void main(void) {
    vec2 offsetPosition = worldPosition + vec2(pixelSize);
    vec2 fract0 = fract(offsetPosition);
    vec2 fract1 = fract(offsetPosition / 5.0);
    vec2 grid0 = step(pixelSize, fract0);
    vec2 grid1 = step(pixelSize * 0.4, fract1);
    gl_FragColor = vec4(
      mix(gridColor, color, grid0.x * grid0.y * grid1.x * grid1.y),
      1.0
    );
  }
`;

const BackgroundGeometry = new Geometry(
  new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
  new Uint16Array([0, 1, 2, 2, 3, 0]),
  {vertex: 2},
);

function getWorldMatrix(camera: Camera): number[] {
  const halfSize = camera.size * 0.5;
  // prettier-ignore
  return [
    halfSize * camera.aspect, 0.0, 0.0,
    0.0, halfSize, 0.0,
    camera.x, camera.y, 1.0,
  ];
}

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
  // we use our function pointer as a cache key
  const program = renderer.getProgram(
    renderBackground,
    renderer.getVertexShader(renderBackground, VERTEX_SHADER),
    renderer.getFragmentShader(renderBackground, FRAGMENT_SHADER),
  );
  const props = RendererComponents.background.properties;
  program.setUniformMatrix('worldMatrix', renderer.camera, getWorldMatrix);
  program.setUniformColor('color', data.color || props.color.defaultValue);
  program.setUniformColor(
    'gridColor',
    data.gridColor || props.gridColor.defaultValue,
  );
  program.setUniformFloat(
    'pixelSize',
    (2.0 * renderer.camera.size) / renderer.canvas.height,
  );
  renderer.setEnabled(renderer.gl.BLEND, false);
  BackgroundGeometry.draw(program);
}
