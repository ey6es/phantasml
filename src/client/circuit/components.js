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
 * The circuit component category.
 */
export const CircuitCategory: {[string]: CategoryData} = {
  circuit: {
    label: <FormattedMessage id="circuit.title" defaultMessage="Circuit" />,
  },
};

/**
 * Circuit component metadata mapped by component name.
 */
export const CircuitComponents: {[string]: ComponentData} = {};
