/**
 * Render component metadata.
 *
 * @module client/renderer/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData} from '../component';

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
      },
      gridColor: {
        type: 'color',
        label: (
          <FormattedMessage
            id="background.grid_color"
            defaultMessage="Grid Color:"
          />
        ),
      },
    },
    removable: false,
  },
};