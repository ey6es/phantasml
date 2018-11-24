/**
 * Circuit component metadata.
 *
 * @module client/circuit/components
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import type {ComponentData, CategoryData} from '../component';

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
};
