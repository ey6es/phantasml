/**
 * Sensor components.
 *
 * @module client/sensor/sensors
 * @flow
 */

import {SensorComponents} from './components';
import {ShapeList} from '../../server/store/shape';
import {getValue} from '../../server/store/util';

type SensorData = {
  createShapeList: Object => ShapeList,
};

/**
 * Sensor component functions mapped by component name.
 */
export const ComponentSensors: {[string]: SensorData} = {
  eye: {
    createShapeList: data => {
      const props = SensorComponents.eye.properties;
      const fov = getValue(data.fov, props.fov.defaultValue);
      const minDepth = getValue(data.minDepth, props.minDepth.defaultValue);
      const maxDepth = getValue(data.maxDepth, props.maxDepth.defaultValue);
      return new ShapeList();
    },
  },
};
