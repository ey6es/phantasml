/**
 * Effector component metadata.
 *
 * @module client/effector/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';

// ensure that renderers are included in build
import './renderers';

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
    properties: {
      linear: {
        type: 'number',
        label: (
          <FormattedMessage id="velocity.linear" defaultMessage="Linear:" />
        ),
        step: 0.1,
        precision: 1,
        defaultValue: 5,
      },
      angular: {
        type: 'number',
        label: (
          <FormattedMessage id="velocity.angular" defaultMessage="Angular:" />
        ),
        defaultValue: 45,
      },
    },
    category: 'effector',
    removable: false,
  },
};
