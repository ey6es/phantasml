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
import {getTransformMatrix, getTransformScale} from '../../server/store/math';

type RendererData = {
  getZOrder: Object => number,
  createRenderFn: (Object, Entity) => Renderer => void,
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
        return (renderer: Renderer) => {
          const transform: Transform = entity.getLastDerivedValue(
            'worldTransform',
          );
          renderShape(renderer, transform, pathColor, fillColor, geometry);
        };
      }
      const getGeometry = (entity: Entity, exponent: number) => {
        return new Geometry(...shapeList.createGeometry(2 ** exponent));
      };
      return (renderer: Renderer) => {
        const transform: Transform = entity.getLastDerivedValue(
          'worldTransform',
        );
        const scale = getTransformScale(transform);
        const uniform = Math.max(Math.abs(scale.x), Math.abs(scale.y));
        const world = renderer.pixelsToWorldUnits / renderer.levelOfDetail;
        const tessellation = uniform / world;
        if (tessellation === 0.0) {
          return;
        }
        const exponent = Math.round(Math.log(tessellation) / Math.LN2);
        const geometry = entity.getCachedValue(exponent, getGeometry);
        renderShape(renderer, transform, pathColor, fillColor, geometry);
      };
    },
  },
};

function renderShape(
  renderer: Renderer,
  transform: Transform,
  pathColor: string,
  fillColor: string,
  geometry: Geometry,
) {
  const program = renderer.getProgram(
    renderShape,
    renderer.getVertexShader(renderShape, SHAPE_VERTEX_SHADER),
    renderer.getFragmentShader(renderShape, SHAPE_FRAGMENT_SHADER),
  );
  program.setUniformViewProjectionMatrix('viewProjectionMatrix');
  program.setUniformMatrix('modelMatrix', transform, getTransformMatrix);
  program.setUniformFloat('pixelsToWorldUnits', renderer.pixelsToWorldUnits);
  program.setUniformColor('pathColor', pathColor);
  program.setUniformColor('fillColor', fillColor);
  renderer.setEnabled(renderer.gl.BLEND, true);
  geometry.draw(program);
}

const SHAPE_VERTEX_SHADER = `
  uniform mat3 modelMatrix;
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
    vec2 point = vertex + vector * thickness;
    vec3 position = viewProjectionMatrix * (modelMatrix * vec3(point, 1.0));
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
    float inside = 1.0 - smoothstep(1.0 - stepSize, 1.0, dist);
    // joints are drawn twice, so adjust alpha accordingly
    float joint = smoothstep(0.0, stepSize, interpolatedJoint);
    float alpha = mix(2.0 * inside - inside * inside, inside, joint);
    gl_FragColor = vec4(pathColor, alpha);
  }
`;
