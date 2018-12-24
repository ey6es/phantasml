/**
 * Circuit component metadata.
 *
 * @module client/circuit/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';
import {WidthLabel, HeightLabel} from '../geometry/components';

// ensure that renderers are included in build
import './renderers';

/**
 * The circuit component categories.
 */
export const CircuitCategories: {[string]: CategoryData} = {
  circuit: {
    label: <FormattedMessage id="circuit.title" defaultMessage="Circuit" />,
  },
  basic: {
    label: <FormattedMessage id="basic.title" defaultMessage="Basic" />,
    parent: 'circuit',
  },
  control: {
    label: <FormattedMessage id="control.title" defaultMessage="Control" />,
    parent: 'circuit',
  },
  display: {
    label: <FormattedMessage id="display.title" defaultMessage="Display" />,
    parent: 'circuit',
  },
};

/**
 * The shared input count property.
 */
export const InputsProperty = {
  inputs: {
    type: 'number',
    label: <FormattedMessage id="circuit.inputs" defaultMessage="Inputs:" />,
    min: 2,
    defaultValue: 2,
  },
};

/**
 * The shared output count property.
 */
export const OutputsProperty = {
  outputs: {
    type: 'number',
    label: <FormattedMessage id="circuit.outputs" defaultMessage="Outputs:" />,
    min: 1,
    defaultValue: 2,
  },
};

/**
 * Circuit component metadata mapped by component name.
 */
export const CircuitComponents: {[string]: ComponentData} = {
  split: {
    label: <FormattedMessage id="split.title" defaultMessage="Split" />,
    properties: {
      ...OutputsProperty,
    },
    category: 'basic',
  },
  invert: {
    label: <FormattedMessage id="invert.title" defaultMessage="Invert" />,
    properties: {},
    category: 'basic',
  },
  add: {
    label: <FormattedMessage id="add.title" defaultMessage="Add" />,
    properties: {
      ...InputsProperty,
    },
    category: 'basic',
  },
  multiply: {
    label: <FormattedMessage id="multiply.title" defaultMessage="Multiply" />,
    properties: {
      ...InputsProperty,
    },
    category: 'basic',
  },
  pushButton: {
    label: (
      <FormattedMessage id="push_button.title" defaultMessage="Push Button" />
    ),
    properties: {
      unpressed: {
        type: 'number',
        label: (
          <FormattedMessage
            id="push_button.unpressed"
            defaultMessage="Unpressed:"
          />
        ),
        step: 0.01,
        precision: 2,
      },
      pressed: {
        type: 'number',
        label: (
          <FormattedMessage
            id="push_button.pressed"
            defaultMessage="Pressed:"
          />
        ),
        step: 0.01,
        precision: 2,
        defaultValue: 1.0,
      },
    },
    category: 'control',
  },
  pseudo3d: {
    label: <FormattedMessage id="pseudo3d.title" defaultMessage="Pseudo 3D" />,
    properties: {
      width: {
        type: 'number',
        label: WidthLabel,
        min: 0.0,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        defaultValue: 10.0,
      },
      height: {
        type: 'number',
        label: HeightLabel,
        min: 0.0,
        step: 0.01,
        wheelStep: 0.1,
        precision: 2,
        defaultValue: 5.0,
      },
    },
    category: 'display',
  },
  inputBus: {
    label: <FormattedMessage id="input_bus.title" defaultMessage="Input Bus" />,
    properties: {},
  },
  outputBus: {
    label: (
      <FormattedMessage id="output_bus.title" defaultMessage="Output Bus" />
    ),
    properties: {},
  },
};
