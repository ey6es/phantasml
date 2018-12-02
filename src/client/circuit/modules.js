/**
 * Circuit component implementations.
 *
 * @module client/circuit/modules
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {InputsProperty, OutputsProperty} from './components';
import {ShapeList} from '../../server/store/shape';

type InputData = {
  label: React.Element<any>,
};

type OutputData = {
  label: React.Element<any>,
};

type ModuleData = {
  getIcon: Object => ShapeList,
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

const IconAttributes = {
  thickness: 0.2,
  pathColor: [1.0, 1.0, 1.0],
  fillColor: [1.0, 1.0, 1.0],
};

const SplitIcon = new ShapeList()
  .move(-0.5, 0.0)
  .penDown(false, IconAttributes)
  .advance(0.5)
  .pivot(45)
  .advance(Math.SQRT1_2)
  .penUp()
  .move(0, 0, -45)
  .penDown()
  .advance(Math.SQRT1_2);

const InvertIcon = new ShapeList()
  .move(-0.5, 0)
  .penDown(false, IconAttributes)
  .advance(1.0);

const AddIcon = new ShapeList()
  .move(-0.5, 0)
  .penDown(false, IconAttributes)
  .advance(1.0)
  .penUp()
  .move(0, -0.5, 90)
  .penDown()
  .advance(1.0);

const MultiplyIcon = new ShapeList()
  .move(0, -0.5, 90)
  .penDown(false, IconAttributes)
  .advance(1.0)
  .penUp()
  .move(-0.4, -0.2, 26.565)
  .penDown()
  .advance(0.8944)
  .penUp()
  .move(-0.4, 0.2, -26.565)
  .penDown()
  .advance(0.8944);

/**
 * Circuit component functions mapped by component name.
 */
export const ComponentModules: {[string]: ModuleData} = {
  split: {
    getIcon: data => SplitIcon,
    getInputs: data => SingleInput,
    getOutputs: createMultipleOutputs,
  },
  invert: {
    getIcon: data => InvertIcon,
    getInputs: data => SingleInput,
    getOutputs: data => SingleOutput,
  },
  add: {
    getIcon: data => AddIcon,
    getInputs: data =>
      createMultipleInputs(data, index => (
        <FormattedMessage
          id="add.summand.n"
          defaultMessage="Summand {number}"
          values={{number: index}}
        />
      )),
    getOutputs: data => ({
      output: {
        label: <FormattedMessage id="add.sum" defaultMessage="Sum" />,
      },
    }),
  },
  multiply: {
    getIcon: data => MultiplyIcon,
    getInputs: data =>
      createMultipleInputs(data, index => (
        <FormattedMessage
          id="multiply.factor.n"
          defaultMessage="Factor {number}"
          values={{number: index}}
        />
      )),
    getOutputs: data => ({
      output: {
        label: (
          <FormattedMessage id="multiply.product" defaultMessage="Product" />
        ),
      },
    }),
  },
};

function createMultipleInputs(
  data: Object,
  getLabel: number => React.Element<any>,
): {[string]: InputData} {
  const inputs = {};
  const inputCount = data.inputs || InputsProperty.inputs.defaultValue;
  for (let ii = 1; ii <= inputCount; ii++) {
    inputs['input' + ii] = {label: getLabel(ii)};
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
