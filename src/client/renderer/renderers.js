/**
 * Component renderers.
 *
 * @module client/renderer/renderers
 * @flow
 */

import {RendererComponents} from './components';
import type {Renderer} from './util';
import {Geometry} from './util';
import type {Entity} from '../../server/store/resource';
import {TransferableValue} from '../../server/store/resource';
import type {ShapeList} from '../../server/store/shape';
import {getShapeList} from '../../server/store/geometry';
import type {Transform} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  getTransformMaxScaleMagnitude,
  composeTransforms,
} from '../../server/store/math';

/** Type of hover states that alter rendering behavior. */
export type HoverState = boolean | 'erase' | Transform;

type RendererData = {
  getZOrder: Object => number,
  createRenderFn: (Object, Entity) => (Renderer, boolean, HoverState) => void,
};

/**
 * Renderer component functions mapped by component name.
 */
export const ComponentRenderers: {[string]: RendererData} = {
  shapeRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (data: Object, entity: Entity) => {
      const props = RendererComponents.shapeRenderer.properties;
      const pathColor = data.pathColor || props.pathColor.defaultValue;
      const fillColor = data.fillColor || props.fillColor.defaultValue;
      const shapeList = getShapeList(entity);
      if (!shapeList) {
        return () => {};
      }
      const renderShapeFn = entity.state.shapeList
        ? renderShapeList
        : renderShape;
      if (!shapeList.requiresTessellation()) {
        const geometry: Geometry = (entity.getCachedValue(
          'geometry',
          createGeometry,
          shapeList,
          0,
        ): any);
        return (renderer, selected, hoverState) => {
          const transform: Transform = entity.getLastCachedValue(
            'worldTransform',
          );
          renderShapeFn(
            renderer,
            transform,
            pathColor,
            fillColor,
            geometry,
            selected,
            hoverState,
          );
        };
      }
      return (renderer, selected, hoverState) => {
        const transform: Transform = entity.getLastCachedValue(
          'worldTransform',
        );
        const magnitude = getTransformMaxScaleMagnitude(transform);
        const world = renderer.pixelsToWorldUnits / renderer.levelOfDetail;
        const tessellation = magnitude / world;
        const exponent =
          tessellation === 0.0
            ? 0.0
            : Math.round(Math.log(tessellation) / Math.LN2);
        const geometry: Geometry = (entity.getCachedValue(
          exponent,
          createGeometry,
          shapeList,
          exponent,
        ): any);
        renderShapeFn(
          renderer,
          transform,
          pathColor,
          fillColor,
          geometry,
          selected,
          hoverState,
        );
      };
    },
  },
};

function createGeometry(
  shapeList: ShapeList,
  exponent: number,
): TransferableValue<Geometry> {
  return new TransferableValue(
    new Geometry(...shapeList.createGeometry(2 ** exponent)),
    newEntity => {
      return newEntity.getLastCachedValue('shapeList') === shapeList;
    },
  );
}

function renderShape(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  if (typeof hoverState === 'object') {
    renderTranslucentShape(
      renderer,
      composeTransforms(hoverState, transform),
      pathColor,
      fillColor,
      geometry,
    );
    return;
  }
  if (selected || hoverState) {
    renderBackdrop(renderer, transform, geometry, selected, hoverState);
  }
  const program = renderer.getProgram(
    renderShape,
    renderer.getVertexShader(renderShape, SHAPE_VERTEX_SHADER),
    renderer.getFragmentShader(renderShape, SHAPE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const SHAPE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float thickness;
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

/**
 * Fragment shader used for general shapes.
 */
export const SHAPE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 pathColor;
  uniform vec3 fillColor;
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
    gl_FragColor = vec4(mix(fillColor, pathColor, filled), alpha);
  }
`;

function renderTranslucentShape(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderTranslucentShape,
    renderer.getVertexShader(renderTranslucentShape, SHAPE_VERTEX_SHADER),
    renderer.getFragmentShader(
      renderTranslucentShape,
      TRANSLUCENT_SHAPE_FRAGMENT_SHADER,
    ),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

export const TRANSLUCENT_SHAPE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 pathColor;
  uniform vec3 fillColor;
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
    gl_FragColor = vec4(mix(fillColor, pathColor, filled), alpha * 0.25);
  }
`;

function renderShapeList(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  if (typeof hoverState === 'object') {
    renderTranslucentShapeList(
      renderer,
      composeTransforms(hoverState, transform),
      pathColor,
      fillColor,
      geometry,
    );
    return;
  }
  if (selected || hoverState) {
    renderBackdrop(renderer, transform, geometry, selected, hoverState);
  }
  const program = renderer.getProgram(
    renderShapeList,
    renderer.getVertexShader(renderShapeList, SHAPE_LIST_VERTEX_SHADER),
    renderer.getFragmentShader(renderShapeList, SHAPE_LIST_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColorScale', pathColor);
  program.setUniformColor('fillColorScale', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const SHAPE_LIST_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform vec3 pathColorScale;
  uniform vec3 fillColorScale;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float thickness;
  attribute vec3 pathColor;
  attribute vec3 fillColor;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    interpolatedPathColor = pathColor * pathColorScale;
    interpolatedFillColor = fillColor * fillColorScale;
    stepSize = pixelsToWorldUnits / thickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * thickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SHAPE_LIST_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(
      mix(interpolatedFillColor, interpolatedPathColor, filled),
      alpha
    );
  }
`;

function renderTranslucentShapeList(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderTranslucentShapeList,
    renderer.getVertexShader(
      renderTranslucentShapeList,
      SHAPE_LIST_VERTEX_SHADER,
    ),
    renderer.getFragmentShader(
      renderTranslucentShapeList,
      TRANSLUCENT_SHAPE_LIST_FRAGMENT_SHADER,
    ),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColorScale', pathColor);
  program.setUniformColor('fillColorScale', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

export const TRANSLUCENT_SHAPE_LIST_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  varying vec3 interpolatedPathColor;
  varying vec3 interpolatedFillColor;
  void main(void) {
    float dist = length(interpolatedVector);
    float filled = 1.0 - step(dist, 0.0);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(
      mix(interpolatedFillColor, interpolatedPathColor, filled),
      alpha * 0.25
    );
  }
`;

/** The color used to indicate general hovering/selection. */
export const SELECT_COLOR = '#00bc8c';

/** The color used to indicate erasing. */
export const ERASE_COLOR = '#e74c3c';

function renderBackdrop(
  renderer: Renderer,
  transform: Transform,
  geometry: Geometry,
  selected: boolean,
  hoverState: HoverState,
) {
  const program = renderer.getProgram(
    renderBackdrop,
    renderer.getVertexShader(renderBackdrop, BACKDROP_VERTEX_SHADER),
    renderer.getFragmentShader(renderBackdrop, BACKDROP_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformMatrix('vectorMatrix', getTransformVectorMatrix(transform));
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor(
    'color',
    hoverState === 'erase' ? ERASE_COLOR : SELECT_COLOR,
  );
  program.setUniformFloat('alpha', selected ? 1.0 : 0.25);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const BACKDROP_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
  uniform mat2 vectorMatrix;
  uniform mat3 viewProjectionMatrix;
  uniform float pixelsToWorldUnits;
  uniform float expansion;
  attribute vec2 vertex;
  attribute vec2 vector;
  attribute float joint;
  attribute float thickness;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    interpolatedVector = vector;
    interpolatedJoint = joint;
    float expandedThickness = thickness + pixelsToWorldUnits * 3.0;
    stepSize = pixelsToWorldUnits / expandedThickness;
    vec3 point =
      modelMatrix * vec3(vertex, 1.0) +
      vec3(vectorMatrix * vector, 0.0) * expandedThickness;
    vec3 position = viewProjectionMatrix * point;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BACKDROP_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 color;
  uniform float alpha;
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float baseAlpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(color, baseAlpha * alpha);
  }
`;
