/**
 * Geometry component metadata.
 *
 * @module client/geometry/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';
import {
  DEFAULT_THICKNESS,
  DEFAULT_LINE_LENGTH,
  DEFAULT_LINE_GROUP_VERTICES,
  DEFAULT_LINE_GROUP_LOOP,
  DEFAULT_POLYGON_VERTICES,
  DEFAULT_POLYGON_FILL,
  DEFAULT_RECTANGLE_WIDTH,
  DEFAULT_RECTANGLE_HEIGHT,
  DEFAULT_RECTANGLE_FILL,
  DEFAULT_ARC_RADIUS,
  DEFAULT_ARC_START_ANGLE,
  DEFAULT_ARC_END_ANGLE,
  DEFAULT_ARC_FILL,
  DEFAULT_CURVE_SPAN,
  DEFAULT_CURVE_C1,
  DEFAULT_CURVE_C2,
} from '../../server/store/geometry';
import {vec2} from '../../server/store/math';

/**
 * The geometry component category.
 */
export const GeometryCategory: {[string]: CategoryData} = {
  geometry: {
    label: <FormattedMessage id="geometry.title" defaultMessage="Geometry" />,
  },
};

/**
 * Shared property for thickness.
 */
export const ThicknessProperty = {
  thickness: {
    type: 'number',
    label: (
      <FormattedMessage id="geometry.thickness" defaultMessage="Thickness:" />
    ),
    defaultValue: DEFAULT_THICKNESS,
    step: 0.01,
    wheelStep: 0.1,
    precision: 2,
    min: 0,
  },
};

const VerticesLabel = (
  <FormattedMessage id="geometry.vertices" defaultMessage="Vertices:" />
);

const FillLabel = (
  <FormattedMessage id="geometry.fill" defaultMessage="Fill:" />
);

/**
 * Geometry component metadata mapped by component name.
 */
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
        defaultValue: DEFAULT_LINE_LENGTH,
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
      vertices: {
        type: 'array',
        elements: {type: 'vector'},
        label: VerticesLabel,
        defaultValue: DEFAULT_LINE_GROUP_VERTICES,
      },
      loop: {
        type: 'boolean',
        label: <FormattedMessage id="line_group.loop" defaultMessage="Loop:" />,
        defaultValue: DEFAULT_LINE_GROUP_LOOP,
      },
    },
    category: 'geometry',
  },
  polygon: {
    label: <FormattedMessage id="polygon.title" defaultMessage="Polygon" />,
    properties: {
      ...ThicknessProperty,
      vertices: {
        type: 'array',
        elements: {type: 'vector'},
        label: VerticesLabel,
        defaultValue: DEFAULT_POLYGON_VERTICES,
      },
      fill: {
        type: 'boolean',
        label: FillLabel,
        defaultValue: DEFAULT_POLYGON_FILL,
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
        defaultValue: DEFAULT_RECTANGLE_WIDTH,
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
        defaultValue: DEFAULT_RECTANGLE_HEIGHT,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      fill: {
        type: 'boolean',
        label: FillLabel,
        defaultValue: DEFAULT_RECTANGLE_FILL,
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
        defaultValue: DEFAULT_ARC_RADIUS,
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
        defaultValue: DEFAULT_ARC_START_ANGLE,
      },
      endAngle: {
        type: 'angle',
        label: (
          <FormattedMessage id="arc.end_angle" defaultMessage="End Angle:" />
        ),
        defaultValue: DEFAULT_ARC_END_ANGLE,
      },
      fill: {
        type: 'boolean',
        label: FillLabel,
        defaultValue: DEFAULT_ARC_FILL,
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
        defaultValue: DEFAULT_CURVE_SPAN,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      c1: {
        type: 'vector',
        label: <FormattedMessage id="curve.c1" defaultMessage="Control 1:" />,
        defaultValue: DEFAULT_CURVE_C1,
      },
      c2: {
        type: 'vector',
        label: <FormattedMessage id="curve.c2" defaultMessage="Control 2:" />,
        defaultValue: DEFAULT_CURVE_C2,
      },
    },
    category: 'geometry',
  },
};
