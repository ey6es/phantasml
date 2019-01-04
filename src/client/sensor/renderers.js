/**
 * Sensor renderers.
 *
 * @module client/sensor/renderers
 * @flow
 */

import {ComponentSensors} from './sensors';
import {ComponentEditCallbacks} from '../store';
import {
  ComponentRenderers,
  BaseRenderer,
  createShapeListRenderFn,
  renderShapeList,
} from '../renderer/renderers';
import {ComponentBounds, BaseBounds} from '../../server/store/bounds';
import {
  ComponentGeometry,
  BaseGeometry,
  getShapeList,
} from '../../server/store/geometry';
import {ShapeList} from '../../server/store/shape';
import {extend} from '../../server/store/util';

ComponentBounds.sensorRenderer = BaseBounds;

ComponentGeometry.sensorRenderer = extend(BaseGeometry, {
  createShapeList: (idTree, entity) => {
    for (const key in entity.state) {
      const sensor = ComponentSensors[key];
      if (sensor) {
        return sensor.createShapeList(entity.state[key]);
      }
    }
    return new ShapeList();
  },
});

ComponentRenderers.sensorRenderer = extend(BaseRenderer, {
  createRenderFn: (idTree, entity) => {
    const shapeList = getShapeList(idTree, entity);
    if (!shapeList) {
      return () => {};
    }
    return createShapeListRenderFn(
      entity,
      shapeList,
      renderShapeList,
      '#ffffff',
      '#ffffff',
    );
  },
});

ComponentEditCallbacks.sensorRenderer = {
  onDelete: (scene, entity, map) => {
    return map;
  },
  onEdit: (scene, entity, map) => {
    return map;
  },
};
