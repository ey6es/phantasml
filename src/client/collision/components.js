/**
 * Collision component metadata.
 *
 * @module client/collision/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';
import {ThicknessProperty} from '../geometry/components';

/**
 * The collision component category.
 */
export const CollisionCategory: {[string]: CategoryData} = {
  collision: {
    label: <FormattedMessage id="collision.title" defaultMessage="Collision" />,
  },
};

/**
 * The shared flags property.
 */
export const FlagsProperty = {
  flags: {
    type: 'mask',
    label: <FormattedMessage id="collision.flags" defaultMessage="Flags:" />,
    defaultValue: 1,
  },
};

/**
 * The shared mask property.
 */
export const MaskProperty = {
  mask: {
    type: 'mask',
    label: <FormattedMessage id="collision.mask" defaultMessage="Mask:" />,
    defaultValue: 255,
  },
};

/**
 * Collision component metadata mapped by component name.
 */
export const CollisionComponents: {[string]: ComponentData} = {
  shapeCollider: {
    label: (
      <FormattedMessage
        id="shape_collider.title"
        defaultMessage="Shape Collider"
      />
    ),
    properties: {
      ...FlagsProperty,
      ...MaskProperty,
    },
    category: 'collision',
  },
  pointCollider: {
    label: (
      <FormattedMessage
        id="point_collider.title"
        defaultMessage="Point Collider"
      />
    ),
    properties: {
      ...ThicknessProperty,
      ...FlagsProperty,
      ...MaskProperty,
    },
    category: 'collision',
  },
};
