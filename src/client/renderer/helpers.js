/**
 * Helper renderers.
 *
 * @module client/renderer/helpers
 * @flow
 */

import type {Renderer} from './util';
import {Geometry} from './util';
import {SHAPE_FRAGMENT_SHADER} from './renderers';
import type {Vector2, LineSegment, Transform} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  composeTransforms,
  vec2,
  distance,
  timesEquals,
  rotateEquals,
  plus,
  radians,
  degrees,
} from '../../server/store/math';
import {Path, ShapeList} from '../../server/store/shape';

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

const PointHelperGeometry = new Geometry(
  ...new ShapeList().penDown(false).createGeometry(),
);

/**
 * Renders a point helper (used for drawing tools).
 *
 * @param renderer the renderer to use.
 * @param transform the transform to apply to the point.
 * @param thickness the path thickness to use.
 * @param pathColor the color to use for paths.
 * @param [translucent=true] whether to draw the point as translucent.
 */
export function renderPointHelper(
  renderer: Renderer,
  transform: Transform,
  thickness: number,
  pathColor: string,
  translucent: boolean = true,
) {
  const program = renderer.getProgram(
    renderPointHelper,
    renderer.getVertexShader(renderPointHelper, POINT_HELPER_VERTEX_SHADER),
    renderer.getFragmentShader(renderPointHelper, SHAPE_HELPER_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformFloat('thickness', thickness);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformFloat('alphaScale', translucent ? 0.25 : 1.0);
  renderer.setEnabled(renderer.gl.BLEND, true);
  PointHelperGeometry.draw(program);
}

const POINT_HELPER_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float thickness;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    stepSize = pixelsToWorldUnits / thickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SHAPE_HELPER_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 pathColor;
  uniform vec3 fillColor;
  uniform float alphaScale;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(mix(fillColor, pathColor, filled), alpha * alphaScale);
  }
`;

const LineHelperGeometry = new Geometry(
  ...new ShapeList()
    .move(-0.5, 0)
    .penDown(false)
    .advance(1.0)
    .createGeometry(),
);

/**
 * Renders a line helper (used for drawing tools).
 *
 * @param renderer the renderer to use.
 * @param transform the transform to apply to the line.
 * @param thickness the path thickness to use.
 * @param pathColor the color to use for paths.
 * @param length the length of the line.
 * @param [translucent=false] whether to draw the line as translucent.
 */
export function renderLineHelper(
  renderer: Renderer,
  transform: Transform,
  thickness: number,
  pathColor: string,
  length: number,
  translucent: boolean = false,
) {
  const program = renderer.getProgram(
    renderLineHelper,
    renderer.getVertexShader(renderLineHelper, LINE_HELPER_VERTEX_SHADER),
    renderer.getFragmentShader(renderLineHelper, SHAPE_HELPER_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformFloat('thickness', thickness);
  program.setUniformFloat('lineLength', length);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformFloat('alphaScale', translucent ? 0.25 : 1.0);
  renderer.setEnabled(renderer.gl.BLEND, true);
  LineHelperGeometry.draw(program);
}

const LINE_HELPER_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float thickness;
  uniform float lineLength;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    stepSize = pixelsToWorldUnits / thickness;
    vec2 scaledVertex = vertex * vec2(lineLength, 1.0);
    vec3 point =
      modelMatrix * vec3(scaledVertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Renders a polygon helper (used for drawing tools).
 *
 * @param renderer the renderer to use.
 * @param transform the transform to use.
 * @param thickness the path thickness to use.
 * @param pathColor the color to use for paths.
 * @param fillColor the color to use to fill.
 * @param geometry the geometry of the polygon.
 */
export function renderPolygonHelper(
  renderer: Renderer,
  transform: Transform,
  thickness: number,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderPolygonHelper,
    renderer.getVertexShader(renderPolygonHelper, POLYGON_HELPER_VERTEX_SHADER),
    renderer.getFragmentShader(renderPolygonHelper, SHAPE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformFloat('thickness', thickness);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const POLYGON_HELPER_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float thickness;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    stepSize = pixelsToWorldUnits / thickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const RectangleHelperGeometry = new Geometry(
  ...createRectangleShapeList(false).createGeometry(),
);

const FilledRectangleHelperGeometry = new Geometry(
  ...createRectangleShapeList(true).createGeometry(),
);

function createRectangleShapeList(fill: boolean): ShapeList {
  return new ShapeList()
    .move(-0.5, -0.5)
    .penDown(fill)
    .advance(1.0)
    .pivot(90)
    .advance(1.0)
    .pivot(90)
    .advance(1.0)
    .pivot(90)
    .advance(1.0);
}

/**
 * Renders a rectangle helper (used for drawing tools).
 *
 * @param renderer the renderer to use.
 * @param transform the transform to apply to the rectangle.
 * @param thickness the path thickness to use.
 * @param pathColor the color to use for paths.
 * @param fillColor the color to use for fill.
 * @param fill whether or not to fill the rectangle.
 * @param width the width of the rectangle.
 * @param height the height of the rectangle.
 */
export function renderRectangleHelper(
  renderer: Renderer,
  transform: Transform,
  thickness: number,
  pathColor: string,
  fillColor: string,
  fill: boolean,
  width: number,
  height: number,
) {
  const program = renderer.getProgram(
    renderRectangleHelper,
    renderer.getVertexShader(
      renderRectangleHelper,
      RECTANGLE_HELPER_VERTEX_SHADER,
    ),
    renderer.getFragmentShader(renderRectangleHelper, SHAPE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformFloat('thickness', thickness);
  program.setUniformFloat('rectangleWidth', width);
  program.setUniformFloat('rectangleHeight', height);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  (fill ? FilledRectangleHelperGeometry : RectangleHelperGeometry).draw(
    program,
  );
}

const RECTANGLE_HELPER_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float thickness;
  uniform float rectangleWidth;
  uniform float rectangleHeight;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    stepSize = pixelsToWorldUnits / thickness;
    vec2 scaledVertex = vertex * vec2(rectangleWidth, rectangleHeight);
    vec3 point =
      modelMatrix * vec3(scaledVertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const ArcHelperGeometry = new Geometry(
  ...createArcShapeList(false).createGeometry(64.0),
);

const FilledArcHelperGeometry = new Geometry(
  ...createArcShapeList(true).createGeometry(64.0),
);

function createArcShapeList(fill: boolean): ShapeList {
  return new ShapeList()
    .move(1.0, 0, 90, {t: 0.0})
    .penDown(fill)
    .arc(Math.PI, 1.0, {t: 1.0});
}

const OpenFilledArcHelperGeometry = new Geometry(
  ...new ShapeList()
    .penDown(true)
    .move(1, 0, 90, {t: 0.0})
    .arc(Math.PI, 1.0, {t: 1.0})
    .move(0, 0, 0, {t: 1.0})
    .createGeometry(64.0),
);

/**
 * Renders an arc helper (used for drawing tools).
 *
 * @param renderer the renderer to use.
 * @param transform the transform to apply to the arc.
 * @param thickness the path thickness to use.
 * @param pathColor the color to use for paths.
 * @param fillColor the color to use for fill.
 * @param fill whether or not to fill the arc.
 * @param radius the radius of the arc.
 * @param angle the angle of the arc in radians.
 */
export function renderArcHelper(
  renderer: Renderer,
  transform: Transform,
  thickness: number,
  pathColor: string,
  fillColor: string,
  fill: boolean,
  radius: number,
  angle: number,
) {
  const program = renderer.getProgram(
    renderArcHelper,
    renderer.getVertexShader(renderArcHelper, ARC_HELPER_VERTEX_SHADER),
    renderer.getFragmentShader(renderArcHelper, SHAPE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformFloat('thickness', thickness);
  program.setUniformFloat('radius', radius);
  let startAngle = 0.0;
  let endAngle = angle;
  if (angle < 0) {
    startAngle = 2.0 * Math.PI + angle;
    endAngle = 2.0 * Math.PI;
  }
  program.setUniformFloat('startAngle', startAngle);
  program.setUniformFloat('endAngle', endAngle);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  (fill
    ? (angle < 0
      ? startAngle > 0
      : endAngle < 2 * Math.PI)
      ? OpenFilledArcHelperGeometry
      : FilledArcHelperGeometry
    : ArcHelperGeometry
  ).draw(program);
}

const ARC_HELPER_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float thickness;
  uniform float radius;
  uniform float startAngle;
  uniform float endAngle;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float t;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  const float PI = 3.141592654;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    stepSize = pixelsToWorldUnits / thickness;
    float angle = mix(startAngle, endAngle, t);
    float baseAngle = t * PI;
    float cr = cos(angle - baseAngle);
    float sr = sin(angle - baseAngle);
    vec2 rotatedVector = vec2(
      vector.x * cr - vector.y * sr,
      vector.x * sr + vector.y * cr
    );
    vec2 scaledVertex = vec2(cos(angle), sin(angle)) * radius * length(vertex);
    vec3 point =
      modelMatrix * vec3(scaledVertex, 1.0) +
      vec3(vectorMatrix * rotatedVector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const curvePath = new Path()
  .moveTo(vec2(-0.5, 0), 0, {t: 0.0})
  .curveTo(vec2(0.5, 0), vec2(-0.25, 0), vec2(0.25, 0), 0, {t: 1.0});
const CurveHelperGeometry = new Geometry(
  ...new ShapeList([], [curvePath]).createGeometry(64.0),
);

/**
 * Renders a curve helper (used for drawing tools).
 *
 * @param renderer the renderer to use.
 * @param transform the transform to apply to the curve.
 * @param thickness the path thickness to use.
 * @param pathColor the color to use for paths.
 * @param span the span of the curve.
 * @param c1 the first curve control point.
 * @param c2 the second curve control point.
 */
export function renderCurveHelper(
  renderer: Renderer,
  transform: Transform,
  thickness: number,
  pathColor: string,
  span: number,
  c1: Vector2,
  c2: Vector2,
) {
  const program = renderer.getProgram(
    renderCurveHelper,
    renderer.getVertexShader(renderCurveHelper, CURVE_HELPER_VERTEX_SHADER),
    renderer.getFragmentShader(renderCurveHelper, SHAPE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformFloat('thickness', thickness);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformFloat('span', span);
  program.setUniformVector('c1', c1);
  program.setUniformVector('c2', c2);
  renderer.setEnabled(renderer.gl.BLEND, true);
  CurveHelperGeometry.draw(program);
}

const CURVE_HELPER_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float thickness;
  uniform float span;
  uniform vec2 c1;
  uniform vec2 c2;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float t;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    stepSize = pixelsToWorldUnits / thickness;
    vec2 d = vec2(span * -0.5, 0.0);
    vec2 c = 3.0 * (c1 - d);
    vec2 b = 3.0 * (d - 2.0 * c1 + c2);
    vec2 a = vec2(span * 0.5, 0.0) - b - c - d;
    vec2 tangent = normalize(t * (t * a * 3.0 + b * 2.0) + c);
    vec2 bitangent = vec2(-tangent.y, tangent.x);
    vec2 rotatedVector = vec2(
      tangent.x * vector.x + bitangent.x * vector.y,
      tangent.y * vector.x + bitangent.y * vector.y
    );
    vec2 curveVertex = t * (t * (t * a + b) + c) + d;
    vec3 point =
      modelMatrix * vec3(curveVertex, 1.0) +
      vec3(vectorMatrix * rotatedVector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Draws the arrow for the end of a wire.
 *
 * @param shapeList the shapeList to draw to.
 * @return a reference to the shape list, for chaining.
 */
export function drawWireArrow(shapeList: ShapeList): ShapeList {
  return shapeList
    .pivot(-90)
    .advance(0.3)
    .pivot(116.5651)
    .penDown(true)
    .advance(0.67082)
    .pivot(126.8699)
    .advance(0.67082)
    .pivot(116.5651)
    .advance(0.6)
    .penUp();
}

const WireArrowGeometry = new Geometry(
  ...drawWireArrow(new ShapeList().move(-0.3, 0.0)).createGeometry(),
);

/**
 * Renders a wire being manipulated.
 *
 * @param renderer the renderer to use.
 * @param transform the module transform.
 * @param thickness the thickness of the wire.
 * @param color the wire color.
 * @param start the local wire start position.
 * @param end the local wire end position.
 */
export function renderWireHelper(
  renderer: Renderer,
  transform: Transform,
  thickness: number,
  color: string,
  start: Vector2,
  end: Vector2,
) {
  const rotation = Math.atan2(end.y - start.y, end.x - start.x);
  const cosr = Math.cos(rotation);
  const sinr = Math.sin(rotation);
  const span = distance(start, end);
  renderCurveHelper(
    renderer,
    composeTransforms(transform, {
      translation: timesEquals(plus(start, end), 0.5),
      rotation,
    }),
    thickness,
    color,
    span,
    vec2(span * (-0.5 + cosr * 0.5), -sinr * span * 0.5),
    vec2(span * (0.5 - cosr * 0.5), sinr * span * 0.5),
  );
  renderPolygonHelper(
    renderer,
    composeTransforms(transform, {translation: end}),
    thickness,
    color,
    color,
    WireArrowGeometry,
  );
}
