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
import type {ShapeList} from '../../server/store/shape';
import {ComponentGeometry} from '../../server/store/geometry';
import type {Transform} from '../../server/store/math';
import {
  getTransformMatrix,
  getTransformVectorMatrix,
  getTransformMaxScaleMagnitude,
} from '../../server/store/math';

type RendererData = {
  getZOrder: Object => number,
  createRenderFn: (Object, Entity) => (Renderer, boolean) => void,
};

export const ComponentRenderers: {[string]: RendererData} = {
  shapeRenderer: {
    getZOrder: (data: Object) => data.zOrder || 0,
    createRenderFn: (data: Object, entity: Entity) => {
      const props = RendererComponents.shapeRenderer.properties;
      const pathColor = data.pathColor || props.pathColor.defaultValue;
      const fillColor = data.fillColor || props.fillColor.defaultValue;
      let currentShapeList: ?ShapeList;
      for (const key in entity.state) {
        const data = ComponentGeometry[key];
        if (data) {
          if (currentShapeList) {
            currentShapeList.add(data.createShapeList(entity.state[key]));
          } else {
            currentShapeList = data.createShapeList(entity.state[key]);
          }
        }
      }
      const shapeList = currentShapeList;
      if (!shapeList) {
        return () => {};
      }
      if (!shapeList.requiresTessellation()) {
        const geometry = entity.getCachedValue('geometry', () => {
          return new Geometry(...shapeList.createGeometry());
        });
        return (renderer: Renderer, selected: boolean) => {
          const transform: Transform = entity.getLastCachedValue(
            'worldTransform',
          );
          renderShape(
            renderer,
            transform,
            pathColor,
            fillColor,
            geometry,
            selected,
          );
        };
      }
      const getGeometry = (exponent: number) => {
        return new Geometry(...shapeList.createGeometry(2 ** exponent));
      };
      return (renderer: Renderer, selected: boolean) => {
        const transform: Transform = entity.getLastCachedValue(
          'worldTransform',
        );
        const magnitude = getTransformMaxScaleMagnitude(transform);
        const world = renderer.pixelsToWorldUnits / renderer.levelOfDetail;
        const tessellation = magnitude / world;
        if (tessellation === 0.0) {
          return;
        }
        const exponent = Math.round(Math.log(tessellation) / Math.LN2);
        const geometry = entity.getCachedValue(exponent, getGeometry, exponent);
        renderShape(
          renderer,
          transform,
          pathColor,
          fillColor,
          geometry,
          selected,
        );
      };
    },
  },
};

const selectedKey = {};

function renderShape(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
  selected: boolean,
) {
  if (selected) {
    renderBackdrop(renderer, transform, geometry);
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

function renderBackdrop(
  renderer: Renderer,
  transform: Transform,
  geometry: Geometry,
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

const SHAPE_FRAGMENT_SHADER = `
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
  varying vec2 interpolatedVector;
  varying float interpolatedJoint;
  varying float stepSize;
  void main(void) {
    float dist = length(interpolatedVector);
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(0.0, 0.74, 0.55, alpha);
  }
`;
