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
  DEFAULT_VERTICES,
  DEFAULT_LINE_GROUP_LOOP,
  DEFAULT_FILL,
  DEFAULT_RECTANGLE_WIDTH,
  DEFAULT_RECTANGLE_HEIGHT,
  DEFAULT_ARC_RADIUS,
  DEFAULT_ARC_ANGLE,
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

const VerticesProperty = {
  vertices: {
    type: 'array',
    elements: {type: 'vector'},
    label: (
      <FormattedMessage id="geometry.vertices" defaultMessage="Vertices:" />
    ),
    defaultValue: DEFAULT_VERTICES,
  },
};

/**
 * The shared loop property.
 */
export const LoopProperty = {
  loop: {
    type: 'boolean',
    label: <FormattedMessage id="line_group.loop" defaultMessage="Loop:" />,
    defaultValue: DEFAULT_LINE_GROUP_LOOP,
  },
};

/**
 * The shared fill property.
 */
export const FillProperty = {
  fill: {
    type: 'boolean',
    label: <FormattedMessage id="geometry.fill" defaultMessage="Fill:" />,
    defaultValue: DEFAULT_FILL,
  },
};

/**
 * A shared label for width.
 */
export const WidthLabel = (
  <FormattedMessage id="geometry.width" defaultMessage="Width:" />
);

/**
 * A shared label for height.
 */
export const HeightLabel = (
  <FormattedMessage id="geometry.height" defaultMessage="Height:" />
);

/**
 * A shared label for radius.
 */
export const RadiusLabel = (
  <FormattedMessage id="geometry.radius" defaultMessage="Radius:" />
);

/**
 * A shared label for angle.
 */
export const AngleLabel = (
  <FormattedMessage id="geometry.angle" defaultMessage="Angle:" />
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
      ...VerticesProperty,
      ...LoopProperty,
    },
    category: 'geometry',
  },
  polygon: {
    label: <FormattedMessage id="polygon.title" defaultMessage="Polygon" />,
    properties: {
      ...ThicknessProperty,
      ...VerticesProperty,
      ...FillProperty,
    },
    category: 'geometry',
  },
  rectangle: {
    label: <FormattedMessage id="rectangle.title" defaultMessage="Rectangle" />,
    properties: {
      ...ThicknessProperty,
      width: {
        type: 'number',
        label: WidthLabel,
        defaultValue: DEFAULT_RECTANGLE_WIDTH,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      height: {
        type: 'number',
        label: HeightLabel,
        defaultValue: DEFAULT_RECTANGLE_HEIGHT,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      ...FillProperty,
    },
    category: 'geometry',
  },
  arc: {
    label: <FormattedMessage id="arc.title" defaultMessage="Arc" />,
    properties: {
      ...ThicknessProperty,
      radius: {
        type: 'number',
        label: RadiusLabel,
        defaultValue: DEFAULT_ARC_RADIUS,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        min: 0,
      },
      angle: {
        type: 'angle',
        label: AngleLabel,
        defaultValue: DEFAULT_ARC_ANGLE,
        min: -2 * Math.PI,
        max: 2 * Math.PI,
      },
      ...FillProperty,
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
  sigil: {
    label: <FormattedMessage id="sigil.title" defaultMessage="Sigil" />,
    properties: {
      ...ThicknessProperty,
    },
    category: 'geometry',
  },
  path: {
    label: <FormattedMessage id="path.title" defaultMessage="Path" />,
    properties: {
      ...ThicknessProperty,
    },
  },
  shape: {
    label: <FormattedMessage id="shape.title" defaultMessage="Shape" />,
    properties: {
      ...ThicknessProperty,
      ...FillProperty,
    },
  },
  shapeList: {
    label: (
      <FormattedMessage id="shape_list.title" defaultMessage="Shape List" />
    ),
    properties: {},
  },
};
