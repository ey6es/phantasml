/**
 * Effector component metadata.
 *
 * @module client/effector/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';

/**
 * The effector component category.
 */
export const EffectorCategory: {[string]: CategoryData} = {
  effector: {
    label: <FormattedMessage id="effector.title" defaultMessage="Effector" />,
  },
};

/**
 * Effector component metadata mapped by component name.
 */
export const EffectorComponents: {[string]: ComponentData} = {
  velocity: {
    label: <FormattedMessage id="velocity.title" defaultMessage="Velocity" />,
    properties: {},
    category: 'effector',
  },
};
