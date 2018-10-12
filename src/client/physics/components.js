/**
 * Physics component metadata.
 *
 * @module client/physics/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';
import {vec2} from '../../server/store/math';

export const PhysicsCategory: {[string]: CategoryData} = {
  physics: {
    label: <FormattedMessage id="physics.title" defaultMessage="Physics" />,
  },
};

export const PhysicsComponents: {[string]: ComponentData} = {
  gravity: {
    label: <FormattedMessage id="gravity.title" defaultMessage="Gravity" />,
    properties: {
      color: {
        type: 'vector',
        label: (
          <FormattedMessage id="gravity.acceleration" defaultMessage="Accel:" />
        ),
        defaultValue: vec2(0.0, -9.8),
      },
    },
    page: true,
    entity: false,
    category: 'physics',
  },
};
