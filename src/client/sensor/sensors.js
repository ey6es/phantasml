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
      return new ShapeList()
        .setAttributes({
          thickness: 0.15,
          pathColor: [1.0, 1.0, 1.0],
          fillColor: [0.5, 0.5, 0.5],
        })
        .pivot(fov * -0.5)
        .advance(minDepth)
        .penDown(true)
        .advance(maxDepth - minDepth)
        .pivot(90)
        .turn(fov, maxDepth)
        .pivot(90)
        .advance(maxDepth - minDepth)
        .pivot(90)
        .turn(-fov, -minDepth);
    },
  },
};
