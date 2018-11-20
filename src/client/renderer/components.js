/**
 * Render component metadata.
 *
 * @module client/renderer/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';

/**
 * The renderer component category.
 */
export const RendererCategory: {[string]: CategoryData} = {
  renderer: {
    label: <FormattedMessage id="renderer.title" defaultMessage="Renderer" />,
  },
};

/**
 * Shared path color property.
 */
export const PathColorProperty = {
  pathColor: {
    type: 'color',
    label: (
      <FormattedMessage
        id="shape_renderer.path_color"
        defaultMessage="Path Color:"
      />
    ),
    defaultValue: '#ffffff',
  },
};

/**
 * Shared fill color property.
 */
export const FillColorProperty = {
  fillColor: {
    type: 'color',
    label: (
      <FormattedMessage
        id="shape_renderer.fill_color"
        defaultMessage="Fill Color:"
      />
    ),
    defaultValue: '#808080',
  },
};

const ZOrderProperty = {
  zOrder: {
    type: 'number',
    label: (
      <FormattedMessage id="shape_renderer.z_order" defaultMessage="Z Order:" />
    ),
  },
};

/**
 * Renderer component metadata mapped by component name.
 */
export const RendererComponents: {[string]: ComponentData} = {
  background: {
    label: (
      <FormattedMessage id="background.title" defaultMessage="Background" />
    ),
    properties: {
      color: {
        type: 'color',
        label: (
          <FormattedMessage id="background.color" defaultMessage="Color:" />
        ),
        defaultValue: '#222222',
      },
      gridColor: {
        type: 'color',
        label: (
          <FormattedMessage
            id="background.grid_color"
            defaultMessage="Grid Color:"
          />
        ),
        defaultValue: '#282828',
      },
    },
    page: true,
    entity: false,
    removable: false,
  },
  shapeRenderer: {
    label: (
      <FormattedMessage
        id="shape_renderer.title"
        defaultMessage="Shape Renderer"
      />
    ),
    properties: {
      ...PathColorProperty,
      ...FillColorProperty,
      ...ZOrderProperty,
    },
    category: 'renderer',
  },
  textRenderer: {
    label: (
      <FormattedMessage
        id="text_renderer.title"
        defaultMessage="Text Renderer"
      />
    ),
    properties: {
      text: {
        type: 'string',
        label: (
          <FormattedMessage id="text_renderer.text" defaultMessage="Text:" />
        ),
      },
      ...ZOrderProperty,
    },
    category: 'renderer',
  },
  moduleRenderer: {
    label: (
      <FormattedMessage
        id="module_renderer.title"
        defaultMessage="Module Renderer"
      />
    ),
    properties: {
      ...ZOrderProperty,
    },
    category: 'renderer',
  },
};
