/**
 * Circuit component implementations.
 *
 * @module client/circuit/modules
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {InputsProperty, OutputsProperty} from './components';

type InputData = {
  label: React.Element<any>,
};

type OutputData = {
  label: React.Element<any>,
};

type ModuleData = {
  getInputs: Object => {[string]: InputData},
  getOutputs: Object => {[string]: OutputData},
};

const SingleInput = {
  input: {
    label: <FormattedMessage id="circuit.input" defaultMessage="Input" />,
  },
};

const SingleOutput = {
  output: {
    label: <FormattedMessage id="circuit.output" defaultMessage="Output" />,
  },
};

/**
 * Circuit component functions mapped by component name.
 */
export const ComponentModules: {[string]: ModuleData} = {
  split: {
    getInputs: data => SingleInput,
    getOutputs: createMultipleOutputs,
  },
  invert: {
    getInputs: data => SingleInput,
    getOutputs: data => SingleOutput,
  },
  add: {
    getInputs: createMultipleInputs,
    getOutputs: data => SingleOutput,
  },
  multiply: {
    getInputs: createMultipleInputs,
    getOutputs: data => SingleOutput,
  },
};

function createMultipleInputs(data: Object): {[string]: InputData} {
  const inputs = {};
  const inputCount = data.inputs || InputsProperty.inputs.defaultValue;
  for (let ii = 1; ii <= inputCount; ii++) {
    inputs['input' + ii] = {
      label: (
        <FormattedMessage
          id="circuit.input.n"
          defaultMessage="Input {number}"
          values={{number: ii}}
        />
      ),
    };
  }
  return inputs;
}

function createMultipleOutputs(data: Object): {[string]: OutputData} {
  const outputs = {};
  const outputCount = data.outputs || OutputsProperty.outputs.defaultValue;
  for (let ii = 1; ii <= outputCount; ii++) {
    outputs['output' + ii] = {
      label: (
        <FormattedMessage
          id="circuit.output.n"
          defaultMessage="Output {number}"
          values={{number: ii}}
        />
      ),
    };
  }
  return outputs;
}
