/**
 * Effector components.
 *
 * @module client/effector/effectors
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {EffectorComponents} from './components';
import type {InputData} from '../circuit/modules';
import {drawWireArrow} from '../renderer/helpers';
import {ShapeList} from '../../server/store/shape';
import {getValue} from '../../server/store/util';

type EffectorData = {
  createShapeList: Object => ShapeList,
  getInputs: Object => {[string]: InputData},
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
      const shapeList = new ShapeList()
        .move(linear * -0.5, 0.0, 180)
        .setAttributes({pathColor: [1.0, 1.0, 1.0]});
      drawWireArrow(shapeList)
        .move(linear * -0.5, 0.0, 0)
        .penDown(false)
        .advance(linear)
        .penUp();
      drawWireArrow(shapeList).move(0.0, linear * -0.5, -90);
      drawWireArrow(shapeList)
        .move(0.0, linear * -0.5, 90)
        .penDown(false)
        .advance(linear)
        .penUp();
      drawWireArrow(shapeList)
        .move(linear * 0.375, 0.0, 90)
        .penDown()
        .turn(angular * 0.5, linear * 0.375)
        .penUp();
      drawWireArrow(shapeList)
        .move(linear * 0.375, 0.0, -90)
        .penDown()
        .turn(-angular * 0.5, -linear * 0.375)
        .penUp();
      return drawWireArrow(shapeList);
    },
    getInputs: data => ({
      backForward: {
        label: (
          <FormattedMessage
            id="velocity.back_forward"
            defaultMessage="Back/Forward"
          />
        ),
      },
      leftRight: {
        label: (
          <FormattedMessage
            id="velocity.left_right"
            defaultMessage="Left/Right"
          />
        ),
      },
      cwCCW: {
        label: (
          <FormattedMessage id="velocity.cw_ccw" defaultMessage="CW/CCW" />
        ),
      },
    }),
  },
};
