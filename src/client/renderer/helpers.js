/**
 * Helper renderers.
 *
 * @module client/renderer/helpers
 * @flow
 */

import type {LineSegment} from '../util/math';
import type {Renderer} from './util';
import type {Transform} from '../../server/store/math';
import {getTransformMatrix} from '../../server/store/math';

const RECTANGLE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat3 viewProjectionMatrix;
  attribute vec2 vertex;
  varying vec2 modelPosition;
  void main(void) {
    modelPosition = vertex;
    vec3 position = viewProjectionMatrix * (modelMatrix * vec3(vertex, 1.0));
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const RECTANGLE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 color;
  uniform vec2 size;
  uniform float pixelSize;
  varying vec2 modelPosition;
  void main(void) {
    vec2 edgeSize = vec2(2.0 * pixelSize) / size;
    vec2 edge0 = step(edgeSize, modelPosition);
    vec2 edge1 = step(modelPosition, vec2(1.0, 1.0) - edgeSize);
    gl_FragColor = vec4(
      color,
      mix(1.0, 0.1, edge0.x * edge0.y * edge1.x * edge1.y)
    );
  }
`;

const RECTANGLE_ARRAY_BUFFER = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

function getRectangleModelMatrix(rect: LineSegment): number[] {
  // prettier-ignore
  return [
    rect.end.x - rect.start.x, 0.0, 0.0,
    0.0, rect.end.y - rect.start.y, 0.0,
    rect.start.x, rect.start.y, 1.0,
  ];
}

function getRectangleSize(rect: LineSegment): number[] {
  return [
    Math.abs(rect.end.x - rect.start.x),
    Math.abs(rect.end.y - rect.start.y),
  ];
}

/**
 * Renders a selection rectangle.
 *
 * @param renderer the renderer to use.
 * @param rect the rectangle coordinates in world space (used as a cache key,
 * so treat as immutable).
 * @param color the base color of the rectangle.
 */
export function renderRectangle(
  renderer: Renderer,
  rect: LineSegment,
  color: string,
) {
  // use our function pointer as a cache key
  const program = renderer.getProgram(
    renderRectangle,
    renderer.getVertexShader(renderRectangle, RECTANGLE_VERTEX_SHADER),
    renderer.getFragmentShader(renderRectangle, RECTANGLE_FRAGMENT_SHADER),
  );
  renderer.bindProgram(program);
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', rect, getRectangleModelMatrix);
  program.setUniformColor('color', color);
  program.setUniformArray('size', rect, getRectangleSize);
  program.setUniformFloat('pixelSize', renderer.pixelsToWorldUnits);
  renderer.bindArrayBuffer(
    renderer.getArrayBuffer(renderRectangle, RECTANGLE_ARRAY_BUFFER),
  );
  const attribLocation = program.getAttribLocation('vertex');
  renderer.enableVertexAttribArray(attribLocation);
  const gl = renderer.gl;
  renderer.setEnabled(gl.BLEND, true);
  gl.vertexAttribPointer(attribLocation, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

/** The hover states for handles. */
export type HoverType = 'x' | 'y' | 'xy';

/**
 * Renders a translation handle.
 *
 * @param renderer the renderer to use.
 * @param transform the handle transform in world space (used as a cache key,
 * so treat as immutable).
 * @param hover the handle hover state.
 */
export function renderTranslationHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
) {
  renderHandle(renderer, transform, hover);
}

/**
 * Renders a rotation handle.
 *
 * @param renderer the renderer to use.
 * @param transform the handle transform in world space (used as a cache key,
 * so treat as immutable).
 */
export function renderRotationHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
) {
  renderHandle(renderer, transform, hover);
}

/**
 * Renders a scale handle.
 *
 * @param renderer the renderer to use.
 * @param transform the handle transform in world space (used as a cache key,
 * so treat as immutable).
 */
export function renderScaleHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
) {
  renderHandle(renderer, transform, hover);
}

const HANDLE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat3 viewProjectionMatrix;
  attribute vec2 vertex;
  void main(void) {
    vec3 position = viewProjectionMatrix * (modelMatrix * vec3(vertex, 1.0));
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const HANDLE_FRAGMENT_SHADER = `
  precision mediump float;
  void main(void) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  }
`;

function renderHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
) {
  // use our function pointer as a cache key
  const program = renderer.getProgram(
    renderHandle,
    renderer.getVertexShader(renderHandle, HANDLE_VERTEX_SHADER),
    renderer.getFragmentShader(renderHandle, HANDLE_FRAGMENT_SHADER),
  );
  renderer.bindProgram(program);
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  const gl = renderer.gl;
  renderer.setEnabled(gl.BLEND, true);
}
