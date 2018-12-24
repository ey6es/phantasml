/**
 * Sensor component metadata.
 *
 * @module client/sensor/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';

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
    properties: {},
    category: 'sensor',
  },
};
