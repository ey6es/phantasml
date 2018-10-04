/**
 * Helper renderers.
 *
 * @module client/renderer/helpers
 * @flow
 */

import type {LineSegment} from '../util/math';
import type {Renderer} from './util';
import {Geometry} from './util';
import type {Transform} from '../../server/store/math';
import {getTransformMatrix} from '../../server/store/math';
import {ShapeList} from '../../server/store/shape';

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

const RectangleGeometry = new Geometry(
  new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  new Uint16Array([0, 1, 2, 2, 3, 0]),
  {vertex: 2},
);

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
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', rect, getRectangleModelMatrix);
  program.setUniformColor('color', color);
  program.setUniformArray('size', rect, getRectangleSize);
  program.setUniformFloat('pixelSize', renderer.pixelsToWorldUnits);
  renderer.setEnabled(renderer.gl.BLEND, true);
  RectangleGeometry.draw(program);
}

const TranslationHandleGeometry = createHandleGeometry(
  (
    shapeList, // arrow
  ) => shapeList,
);
const RotationHandleGeometry = createHandleGeometry(
  (
    shapeList, // circle
  ) => shapeList,
);
const ScaleHandleGeometry = createHandleGeometry((
  shapeList, // square
) =>
  shapeList
    .pivot(-90)
    .advance(1.0)
    .pivot(90)
    .advance(3.0)
    .pivot(90)
    .advance(3.0)
    .pivot(90)
    .advance(3.0)
    .pivot(90)
    .advance(1.0)
    .pivot(-90),
);

function createHandleGeometry(knobFn: ShapeList => mixed): Geometry {
  const shapeList = new ShapeList();

  shapeList
    .jump(-1.5, -1.5, 0, {part: 0})
    .raise()
    .penDown(true);
  for (let ii = 0; ii < 4; ii++) {
    shapeList.advance(3.0).pivot(90);
  }
  shapeList.penUp().lower();

  shapeList.jump(1.5, -0.5, 0);
  for (let ii = 0; ii < 4; ii++) {
    shapeList
      .penDown(true)
      .advance(1.0, {part: ii & 1 ? 1.0 : 0.5})
      .apply(knobFn)
      .advance(1.0)
      .pivot(90)
      .advance(1.0)
      .penUp()
      .pivot(180)
      .advance(2)
      .pivot(90)
      .advance(1)
      .pivot(-90);
  }

  return new Geometry(...shapeList.createGeometry(4.0));
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
  renderHandle(renderer, transform, hover, ScaleHandleGeometry);
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
  renderHandle(renderer, transform, hover, ScaleHandleGeometry);
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
  renderHandle(renderer, transform, hover, ScaleHandleGeometry);
}

const HANDLE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float thickness;
  attribute vec2 vertex;
  attribute vec3 plane;
  attribute float inside;
  attribute float part;
  varying vec2 modelPosition;
  varying vec3 interpolatedPlane;
  varying float interpolatedInside;
  varying float interpolatedPart;
  void main(void) {
    interpolatedPlane = plane;
    interpolatedInside = inside;
    interpolatedPart = part;
    vec2 expandedVertex = vertex + 2.0 * thickness * plane.xy;
    modelPosition = expandedVertex;
    vec3 position =
      viewProjectionMatrix * (modelMatrix * vec3(expandedVertex, 1.0));
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const HANDLE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform highp float thickness;
  uniform float stepSize;
  varying vec2 modelPosition;
  varying vec3 interpolatedPlane;
  varying float interpolatedInside;
  varying float interpolatedPart;
  void main(void) {
    float normalLength = length(interpolatedPlane.xy);
    float dist =
      dot(vec3(modelPosition, 1.0), interpolatedPlane) / normalLength;
    float inside = max(
      step(0.5, interpolatedInside),
      smoothstep(dist, dist + stepSize, thickness)
    );
    vec3 color = mix(
      vec3(1.0, 1.0, 0.0),
      mix(
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        step(0.75, interpolatedPart)
      ),
      step(0.25, interpolatedPart)
    );
    gl_FragColor = vec4(color, inside);
    //vec2 normal = normalize(interpolatedPlane.xy);
    //gl_FragColor = vec4(normal * 0.5 + vec2(0.5, 0.5), 0.0, 1.0);
    //gl_FragColor = vec4(dist + 0.5, 0.0, 0.0, 1.0);
  }
`;

function renderHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
  geometry: Geometry,
) {
  // use our function pointer as a cache key
  const program = renderer.getProgram(
    renderHandle,
    renderer.getVertexShader(renderHandle, HANDLE_VERTEX_SHADER),
    renderer.getFragmentShader(renderHandle, HANDLE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformFloat('thickness', 0.2);
  program.setUniformFloat('stepSize', 2.0 * renderer.pixelsToWorldUnits);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}
