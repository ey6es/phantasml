/**
 * Sensor component metadata.
 *
 * @module client/sensor/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';

// ensure that renderers are included in build
import './renderers';

/**
 * The sensor component category.
 */
export const SensorCategory: {[string]: CategoryData} = {
  sensor: {
    label: <FormattedMessage id="sensor.title" defaultMessage="Sensor" />,
  },
};

/**
 * Sensor component metadata mapped by component name.
 */
export const SensorComponents: {[string]: ComponentData} = {
  eye: {
    label: <FormattedMessage id="eye.title" defaultMessage="Eye" />,
    properties: {
      fov: {
        type: 'number',
        label: <FormattedMessage id="eye.fov" defaultMessage="FOV:" />,
        min: 0,
        max: 180,
        defaultValue: 60,
      },
      resolution: {
        type: 'number',
        label: (
          <FormattedMessage id="eye.resolution" defaultMessage="Resolution:" />
        ),
        min: 0,
        defaultValue: 256,
      },
      minDepth: {
        type: 'number',
        label: (
          <FormattedMessage id="eye.min_depth" defaultMessage="Min Depth:" />
        ),
        min: 0,
        defaultValue: 1,
      },
      maxDepth: {
        type: 'number',
        label: (
          <FormattedMessage id="eye.max_depth" defaultMessage="Max Depth:" />
        ),
        min: 0,
        defaultValue: 20,
      },
    },
    category: 'sensor',
  },
};
