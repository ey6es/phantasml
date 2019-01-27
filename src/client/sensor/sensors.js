/**
 * Sensor components.
 *
 * @module client/sensor/sensors
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {SensorComponents} from './components';
import type {OutputData} from '../circuit/modules';
import {ShapeList} from '../../server/store/shape';
import {getValue} from '../../server/store/util';

type SensorData = {
  createShapeList: Object => ShapeList,
  getOutputs: Object => {[string]: OutputData},
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
    getOutputs: data => ({
      depth: {
        label: <FormattedMessage id="eye.depth" defaultMessage="Depth" />,
      },
      luma: {
        label: <FormattedMessage id="eye.luma" defaultMessage="Luma" />,
      },
      blueChroma: {
        label: (
          <FormattedMessage id="eye.blue_chroma" defaultMessage="Blue Chroma" />
        ),
      },
      redChroma: {
        label: (
          <FormattedMessage id="eye.red_chroma" defaultMessage="Red Chroma" />
        ),
      },
    }),
  },
  touch: {
    createShapeList: data => {
      const props = SensorComponents.touch.properties;
      const radius = getValue(data.radius, props.radius.defaultValue);
      return new ShapeList()
        .setAttributes({
          thickness: 0.15,
          pathColor: [1.0, 1.0, 1.0],
          fillColor: [0.5, 0.5, 0.5],
        })
        .advance(radius)
        .pivot(90)
        .penDown(true)
        .turn(360, radius);
    },
    getOutputs: data => ({
      active: {
        label: <FormattedMessage id="touch.active" defaultMessage="Active" />,
      },
    }),
  },
};
