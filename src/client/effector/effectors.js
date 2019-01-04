/**
 * Effector components.
 *
 * @module client/effector/effectors
 * @flow
 */

import {EffectorComponents} from './components';
import {ShapeList} from '../../server/store/shape';
import {getValue} from '../../server/store/util';

type EffectorData = {
  createShapeList: Object => ShapeList,
};

/**
 * Effector component functions mapped by component name.
 */
export const ComponentEffectors: {[string]: EffectorData} = {
  velocity: {
    createShapeList: data => {
      const props = EffectorComponents.velocity.properties;
      const linear = getValue(data.linear, props.linear.defaultValue);
      const angular = getValue(data.angular, props.angular.defaultValue);
      return new ShapeList()
        .setAttributes({thickness: 0.2, pathColor: [1.0, 1.0, 1.0]})
        .move(linear * -0.5, 0.0)
        .penDown(false)
        .advance(linear)
        .penUp()
        .move(0.0, linear * -0.5, 90)
        .penDown(false)
        .advance(linear)
        .penUp();
    },
  },
};
