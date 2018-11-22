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
 * Circuit component metadata mapped by component name.
 */
export const CircuitComponents: {[string]: ComponentData} = {
  add: {
    label: <FormattedMessage id="add.title" defaultMessage="Add" />,
    properties: {},
    category: 'basic',
  },
};
