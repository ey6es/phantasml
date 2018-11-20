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

/**
 * The physics component category.
 */
export const PhysicsCategory: {[string]: CategoryData} = {
  physics: {
    label: <FormattedMessage id="physics.title" defaultMessage="Physics" />,
  },
};

/**
 * Shared property for dynamic flag.
 */
export const DynamicProperty = {
  dynamic: {
    type: 'boolean',
    label: (
      <FormattedMessage id="rigid_body.dynamic" defaultMessage="Dynamic:" />
    ),
  },
};

/**
 * Physics component metadata mapped by component name.
 */
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
  rigidBody: {
    label: (
      <FormattedMessage id="rigid_body.title" defaultMessage="Rigid Body" />
    ),
    properties: {
      ...DynamicProperty,
      linearVelocity: {
        type: 'vector',
        label: (
          <FormattedMessage
            id="rigid_body.linear_velocity"
            defaultMessage="Linear Vel:"
          />
        ),
      },
      angularVelocity: {
        type: 'angle',
        label: (
          <FormattedMessage
            id="rigid_body.angular_velocity"
            defaultMessage="Angular Vel:"
          />
        ),
        min: -Infinity,
        max: Infinity,
      },
      density: {
        type: 'number',
        label: (
          <FormattedMessage id="rigid_body.density" defaultMessage="Density:" />
        ),
        min: 0.0,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        defaultValue: 1.0,
      },
      restitution: {
        type: 'number',
        label: (
          <FormattedMessage
            id="rigid_body.restitution"
            defaultMessage="Restitution:"
          />
        ),
        min: 0.0,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        defaultValue: 0.5,
      },
    },
    category: 'physics',
  },
};
