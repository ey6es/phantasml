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
  layout: {
    label: <FormattedMessage id="layout.title" defaultMessage="Layout" />,
    parent: 'circuit',
  },
  arithmetic: {
    label: (
      <FormattedMessage id="arithmetic.title" defaultMessage="Arithmetic" />
    ),
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

const UnaryProperty = {
  unary: {
    type: 'boolean',
    label: <FormattedMessage id="circuit.unary" defaultMessage="Unary:" />,
  },
};

const OffProperty = {
  off: {
    type: 'number',
    label: <FormattedMessage id="control.off" defaultMessage="Off:" />,
    step: 0.01,
    precision: 2,
  },
};

const OnProperty = {
  on: {
    type: 'number',
    label: <FormattedMessage id="control.on" defaultMessage="On:" />,
    step: 0.01,
    precision: 2,
    defaultValue: 1.0,
  },
};

const MinProperty = {
  min: {
    type: 'number',
    label: <FormattedMessage id="control.min" defaultMessage="Min:" />,
    step: 0.01,
    precision: 2,
  },
};

const MaxProperty = {
  max: {
    type: 'number',
    label: <FormattedMessage id="control.max" defaultMessage="Max:" />,
    step: 0.01,
    precision: 2,
    defaultValue: 1.0,
  },
};

/**
 * Circuit component metadata mapped by component name.
 */
export const CircuitComponents: {[string]: ComponentData} = {
  fork: {
    label: <FormattedMessage id="fork.title" defaultMessage="Fork" />,
    properties: {
      ...OutputsProperty,
    },
    category: 'layout',
  },
  add: {
    label: <FormattedMessage id="add.title" defaultMessage="Add" />,
    properties: {
      ...InputsProperty,
    },
    category: 'arithmetic',
  },
  subtract: {
    label: <FormattedMessage id="subtract.title" defaultMessage="Subtract" />,
    properties: {
      ...UnaryProperty,
    },
    category: 'arithmetic',
  },
  multiply: {
    label: <FormattedMessage id="multiply.title" defaultMessage="Multiply" />,
    properties: {
      ...InputsProperty,
    },
    category: 'arithmetic',
  },
  divide: {
    label: <FormattedMessage id="divide.title" defaultMessage="Divide" />,
    properties: {
      ...UnaryProperty,
    },
    category: 'arithmetic',
  },
  pushButton: {
    label: (
      <FormattedMessage id="push_button.title" defaultMessage="Push Button" />
    ),
    properties: {
      ...OffProperty,
      ...OnProperty,
    },
    category: 'control',
  },
  toggleSwitch: {
    label: (
      <FormattedMessage
        id="toggle_switch.title"
        defaultMessage="Toggle Switch"
      />
    ),
    properties: {
      ...OffProperty,
      ...OnProperty,
    },
    category: 'control',
  },
  dial: {
    label: <FormattedMessage id="dial.title" defaultMessage="Dial" />,
    properties: {
      ...MinProperty,
      ...MaxProperty,
    },
    category: 'control',
  },
  slider: {
    label: <FormattedMessage id="slider.title" defaultMessage="Slider" />,
    properties: {
      ...MinProperty,
      ...MaxProperty,
    },
    category: 'control',
  },
  joystick: {
    label: <FormattedMessage id="joystick.title" defaultMessage="Joystick" />,
    properties: {
      ...MinProperty,
      ...MaxProperty,
      autocenter: {
        type: 'boolean',
        label: (
          <FormattedMessage
            id="joystick.autocenter"
            defaultMessage="Autocenter:"
          />
        ),
        defaultValue: true,
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
