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
  renderTranslucentFilledShapeList,
} from '../renderer/renderers';
import {TransferableValue} from '../../server/store/resource';
import {mergeEdits} from '../../server/store/scene';
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
        const data = entity.state[key];
        return new TransferableValue(
          sensor.createShapeList(data),
          newEntity => newEntity.state[key] === data,
        );
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
      renderTranslucentFilledShapeList,
      '#ffffff',
      '#ffffff',
    );
  },
});

ComponentEditCallbacks.sensorRenderer = {
  onCreate: (scene, id, map) => {
    // add id to input bus list
    return mergeEdits(map, {
      inputBus: {inputBus: {sensors: {[id]: true}}},
    });
  },
  onDelete: (scene, entity, map) => {
    // remove id from input bus list
    return mergeEdits(map, {
      inputBus: {inputBus: {sensors: {[entity.id]: null}}},
    });
  },
  onEdit: (scene, entity, map) => {
    // touch input bus in case the sensor outputs changed
    return map.inputBus ? map : mergeEdits(map, {inputBus: {}});
  },
};
