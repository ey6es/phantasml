/**
 * Helper renderers.
 *
 * @module client/renderer/helpers
 * @flow
 */

import type {Renderer} from './util';
import {Geometry} from './util';
import type {LineSegment, Transform} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  radians,
  degrees,
} from '../../server/store/math';
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

const AXES_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float part;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float interpolatedPart;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    interpolatedPart = part;
    float thickness = 2.0 * pixelsToWorldUnits;
    stepSize = pixelsToWorldUnits / thickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const AXES_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float interpolatedPart;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    vec3 color = mix(
      vec3(0.8, 0.8, 0.0),
      mix(
        vec3(0.8, 0.1, 0.0),
        vec3(0.0, 0.8, 0.1),
        step(0.75, interpolatedPart)
      ),
      step(0.25, interpolatedPart)
    );
    gl_FragColor = vec4(color, alpha);
  }
`;

const axesShapeList = new ShapeList()
  .penDown(false, {part: 0.0})
  .advance(3.0)
  .penDown(false, {part: 0.5})
  .advance(12.0)
  .penUp()
  .move(0.0, 3.0, 90)
  .penDown(false, {part: 1.0})
  .advance(12.0);
const AxesGeometry = new Geometry(...axesShapeList.createGeometry(0.4));

/**
 * Renders a pair of coordinate axes to show the translation and rotation of
 * something.
 *
 * @param renderer the renderer to use.
 * @param transform the transform to apply.
 */
export function renderAxes(renderer: Renderer, transform: Transform) {
  const program = renderer.getProgram(
    renderAxes,
    renderer.getVertexShader(renderAxes, AXES_VERTEX_SHADER),
    renderer.getFragmentShader(renderAxes, AXES_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  renderer.setEnabled(renderer.gl.BLEND, true);
  AxesGeometry.draw(program);
}

const TranslationHandleGeometry = createHandleGeometry((
  shapeList, // arrow
) => {
  const length = 15.0;
  const halfAngle = degrees(Math.atan(7.5 / length));
  const sideDistance = 7.5 / Math.sin(radians(halfAngle));
  return shapeList
    .pivot(-90)
    .advance(5.0)
    .pivot(90 + halfAngle)
    .advance(sideDistance)
    .pivot(180 - halfAngle * 2)
    .advance(sideDistance)
    .pivot(90 + halfAngle)
    .advance(5.0)
    .pivot(-90);
});
const RotationHandleGeometry = createHandleGeometry((
  shapeList, // circle
) => {
  const radius = 7.5;
  const angle = degrees(Math.asin(2.5 / radius));
  return shapeList
    .pivot(-90 + angle)
    .turn(360 - 2 * angle, radius)
    .pivot(-90 + angle);
});
const ScaleHandleGeometry = createHandleGeometry((
  shapeList, // square
) =>
  shapeList
    .pivot(-90)
    .advance(5.0)
    .pivot(90)
    .advance(15.0)
    .pivot(90)
    .advance(15.0)
    .pivot(90)
    .advance(15.0)
    .pivot(90)
    .advance(5.0)
    .pivot(-90),
);

function createHandleGeometry(knobFn: ShapeList => mixed): Geometry {
  const shapeList = new ShapeList();

  shapeList
    .jump(-7.5, -7.5, 0, {part: 0})
    .raise()
    .penDown(true);
  for (let ii = 0; ii < 4; ii++) {
    shapeList.advance(15.0).pivot(90);
  }
  shapeList.penUp().lower();

  const armLength = 10.0;
  shapeList.jump(7.5, -2.5, 0);
  for (let ii = 0; ii < 4; ii++) {
    shapeList
      .penDown(true, {part: ii & 1 ? 1.0 : 0.5})
      .advance(armLength)
      .apply(knobFn)
      .advance(armLength)
      .pivot(90)
      .advance(5.0)
      .penUp()
      .pivot(180)
      .advance(10)
      .pivot(90)
      .advance(5)
      .pivot(-90);
  }
  return new Geometry(...shapeList.createGeometry(0.4));
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
 * @param pressed the pressed state.
 */
export function renderTranslationHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
  pressed: boolean,
) {
  renderHandle(renderer, transform, hover, pressed, TranslationHandleGeometry);
}

/**
 * Renders a rotation handle.
 *
 * @param renderer the renderer to use.
 * @param transform the handle transform in world space (used as a cache key,
 * so treat as immutable).
 * @param hover the handle hover state.
 * @param pressed the pressed state.
 */
export function renderRotationHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
  pressed: boolean,
) {
  renderHandle(renderer, transform, hover, pressed, RotationHandleGeometry);
}

/**
 * Renders a scale handle.
 *
 * @param renderer the renderer to use.
 * @param transform the handle transform in world space (used as a cache key,
 * so treat as immutable).
 * @param hover the handle hover state.
 * @param pressed the pressed state.
 */
export function renderScaleHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
  pressed: boolean,
) {
  renderHandle(renderer, transform, hover, pressed, ScaleHandleGeometry);
}

const HANDLE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform vec3 hoverParts;
  uniform float pressed;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float part;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float interpolatedPart;
  varying float interpolatedActive;
  varying float inner;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    interpolatedPart = part;
    float hover = mix(
      hoverParts.x,
      mix(hoverParts.y, hoverParts.z, step(0.75, part)),
      step(0.25, part)
    );
    interpolatedActive = mix(0.73, mix(0.80, 1.0, pressed), hover);
    float thickness = mix(1.0, 1.5, hover * pressed) * pixelsToWorldUnits;
    inner = 1.0 / thickness;
    stepSize = pixelsToWorldUnits / thickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const HANDLE_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float interpolatedPart;
  varying float interpolatedActive;
  varying float inner;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float outerInside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    float innerInside = 1.0 - smoothstep(inner - stepSize, inner, dist);
    float inside = max(outerInside * 0.25, innerInside);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    vec3 color = mix(
      vec3(0.8, 0.8, 0.0),
      mix(
        vec3(0.8, 0.1, 0.0),
        vec3(0.0, 0.8, 0.1),
        step(0.75, interpolatedPart)
      ),
      step(0.25, interpolatedPart)
    );
    gl_FragColor = vec4(color * interpolatedActive, alpha);
  }
`;

function getHoverParts(hover: ?HoverType): number[] {
  return [
    hover === 'xy' ? 1.0 : 0.0,
    hover === 'xy' || hover === 'x' ? 1.0 : 0.0,
    hover === 'xy' || hover === 'y' ? 1.0 : 0.0,
  ];
}

function renderHandle(
  renderer: Renderer,
  transform: Transform,
  hover: ?HoverType,
  pressed: boolean,
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
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformArray('hoverParts', hover, getHoverParts);
  program.setUniformFloat('pressed', pressed ? 1.0 : 0.0);
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}
