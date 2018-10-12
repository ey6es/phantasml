/**
 * Geometry component metadata.
 *
 * @module client/geometry/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';
import {vec2} from '../../server/store/math';

export const GeometryCategory: {[string]: CategoryData} = {
  geometry: {
    label: <FormattedMessage id="geometry.title" defaultMessage="Geometry" />,
  },
};

const ThicknessProperty = {
  thickness: {
    type: 'number',
    label: (
      <FormattedMessage id="geometry.thickness" defaultMessage="Thickness:" />
    ),
    defaultValue: 0.2,
    step: 0.01,
    wheelStep: 0.1,
    precision: 2,
    min: 0,
  },
};

export const GeometryComponents: {[string]: ComponentData} = {
  point: {
    label: <FormattedMessage id="point.title" defaultMessage="Point" />,
    properties: {
      ...ThicknessProperty,
    },
    category: 'geometry',
  },
  line: {
    label: <FormattedMessage id="line.title" defaultMessage="Line" />,
    properties: {
      ...ThicknessProperty,
      length: {
        type: 'number',
        label: <FormattedMessage id="line.length" defaultMessage="Length:" />,
        defaultValue: 5,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
    },
    category: 'geometry',
  },
  lineGroup: {
    label: (
      <FormattedMessage id="line_group.title" defaultMessage="Line Group" />
    ),
    properties: {
      ...ThicknessProperty,
    },
    category: 'geometry',
  },
  polygon: {
    label: <FormattedMessage id="polygon.title" defaultMessage="Polygon" />,
    properties: {
      ...ThicknessProperty,
      fill: {
        type: 'boolean',
        label: <FormattedMessage id="polygon.fill" defaultMessage="Fill:" />,
        defaultValue: true,
      },
    },
    category: 'geometry',
  },
  rectangle: {
    label: <FormattedMessage id="rectangle.title" defaultMessage="Rectangle" />,
    properties: {
      ...ThicknessProperty,
      width: {
        type: 'number',
        label: (
          <FormattedMessage id="rectangle.width" defaultMessage="Width:" />
        ),
        defaultValue: 5,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      height: {
        type: 'number',
        label: (
          <FormattedMessage id="rectangle.height" defaultMessage="Height:" />
        ),
        defaultValue: 5,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
    },
    category: 'geometry',
  },
  arc: {
    label: <FormattedMessage id="arc.title" defaultMessage="Arc" />,
    properties: {
      ...ThicknessProperty,
      radius: {
        type: 'number',
        label: <FormattedMessage id="arc.radius" defaultMessage="Radius:" />,
        defaultValue: 2.5,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      startAngle: {
        type: 'angle',
        label: (
          <FormattedMessage
            id="arc.start_angle"
            defaultMessage="Start Angle:"
          />
        ),
        defaultValue: -180,
      },
      endAngle: {
        type: 'number',
        label: (
          <FormattedMessage id="arc.end_angle" defaultMessage="End Angle:" />
        ),
        defaultValue: 180,
      },
      fill: {
        type: 'boolean',
        label: <FormattedMessage id="arc.fill" defaultMessage="Fill:" />,
      },
    },
    category: 'geometry',
  },
  curve: {
    label: <FormattedMessage id="curve.title" defaultMessage="Bezier Curve" />,
    properties: {
      ...ThicknessProperty,
      span: {
        type: 'number',
        label: <FormattedMessage id="curve.span" defaultMessage="Span:" />,
        defaultValue: 5,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      c1: {
        type: 'vector',
        label: <FormattedMessage id="curve.c1" defaultMessage="Control 1:" />,
        defaultValue: vec2(1.667, 2),
      },
      c2: {
        type: 'vector',
        label: <FormattedMessage id="curve.c2" defaultMessage="Control 2:" />,
        defaultValue: vec2(3.333, -2),
      },
    },
    category: 'geometry',
  },
};
