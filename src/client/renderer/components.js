/**
 * Render component metadata.
 *
 * @module client/renderer/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';

export const RendererCategory: {[string]: CategoryData} = {
  renderer: {
    label: <FormattedMessage id="renderer.title" defaultMessage="Renderer" />,
  },
};

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
      pathColor: {
        type: 'color',
        label: (
          <FormattedMessage
            id="shape_renderer.path_color"
            defaultMessage="Path Color:"
          />
        ),
        defaultValue: '#222222',
      },
      fillColor: {
        type: 'color',
        label: (
          <FormattedMessage
            id="shape_renderer.fill_color"
            defaultMessage="Fill Color:"
          />
        ),
        defaultValue: '#282828',
      },
    },
    category: 'renderer',
  },
};
