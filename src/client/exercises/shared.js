// @flow

import * as React from 'react';

const BINARY_FUNCTIONS: [string, (boolean, boolean) => boolean][] = [
  ['False', (a, b) => false],
  ['True', (a, b) => true],
  ['A', (a, b) => a],
  ['B', (a, b) => b],
  ['Not A', (a, b) => !a],
  ['Not B', (a, b) => !b],
  ['A or B', (a, b) => a || b],
  ['A and B', (a, b) => a && b],
  ['A nor B', (a, b) => !(a || b)],
  ['A nand B', (a, b) => !(a && b)],
  ['A xor B', (a, b) => !!(Number(a) ^ Number(b))],
  ['A xnor B', (a, b) => !(Number(a) ^ Number(b))],
];
const BINARY_PRESETS: [string, boolean[]][] = BINARY_FUNCTIONS.map(
  ([name, fn]) => {
    var data = [];
    for (var ii = 0; ii < 4; ii++) {
      data.push(fn(!!(ii & 2), !!(ii & 1)));
    }
    return [name, data];
  },
);

/**
 * Base class for simple exercises trained on a truth table of two inputs and
 * one output.
 */
export class BinaryExercise extends React.Component<
  {},
  {trainingData: boolean[]},
> {
  state = {trainingData: [false, false, false, false]};

  render() {
    this._train();
    return (
      <div className="top">
        <TruthTable
          title="Training Data"
          generateResult={index => (
            <input
              type="checkbox"
              checked={this.state.trainingData[index]}
              onChange={event => {
                var checked = event.target.checked;
                this.setState(state => (state.trainingData[index] = checked));
              }}
            />
          )}
          footer={
            <select
              value=""
              onChange={event =>
                this.setState({
                  trainingData: event.target.value
                    .split(',')
                    .map(string => string === 'true'),
                })
              }>
              <option class="hidden" value="">
                Presets
              </option>
              {BINARY_PRESETS.map(([name, data]) => (
                <option value={data.toString()}>{name}</option>
              ))}
            </select>
          }
        />
        {this._renderTrainingResults()}
        <TruthTable
          title="Test Results"
          generateResult={index => this._test(index).toString()}
        />
      </div>
    );
  }

  _train() {
    throw new Error('Not implemented.');
  }

  _renderTrainingResults(): React.Element<any> {
    throw new Error('Not implemented.');
  }

  _test(index: number): boolean {
    throw new Error('Not implemented.');
  }
}

function TruthTable(props: {
  title: string,
  generateResult: number => React.Element<any> | string,
  footer?: React.Element<any>,
}) {
  return (
    <div class="titled-table">
      <h4>{props.title}</h4>
      <table className="table table-bordered table-condensed truth-table">
        <thead>
          <tr>
            <th>Input A</th>
            <th>Input B</th>
            <th className="first-output-cell">Output</th>
          </tr>
        </thead>
        <tbody>
          {createRangeArray(0, 4, index => (
            <tr>
              <td>{Boolean(index & 2).toString()}</td>
              <td>{Boolean(index & 1).toString()}</td>
              <td className="first-output-cell">
                {props.generateResult(index)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.footer}
    </div>
  );
}

/**
 * Creates an array by applying the given function to an integer range.
 *
 * @param start the number at which to start the range (inclusive).
 * @param end the number at which to end the range (exclusive).
 * @param fn the function to apply to each number in the range.
 * @return the newly created array with the results.
 */
export function createRangeArray<T>(
  start: number,
  end: number,
  fn: number => T,
): T[] {
  var array = [];
  for (var ii = start; ii < end; ii++) {
    array.push(fn(ii));
  }
  return array;
}

/**
 * Creates an array of random weights in the range [-1, +1).
 *
 * @param count the length of the weight array.
 * @return the newly created array.
 */

export function createRandomWeights(count: number): number[] {
  var weights = [];
  for (var ii = 0; ii < count; ii++) {
    weights.push(Math.random() * 2.0 - 1.0);
  }
  return weights;
}

/**
 * Computes the output of a node with a logistic activation function.
 *
 * @param inputs the input values, including 1.0 for any fixed bias.
 * @param weights the weights to apply to the input values (and bias).
 * @return the result of applying the logistic activation function to the sum
 * of the weighted inputs.
 */
export function computeLogisticOutput(
  inputs: number[],
  weights: number[],
): number {
  var sum = 0.0;
  for (var ii = 0; ii < inputs.length; ii++) {
    sum += inputs[ii] * weights[ii];
  }
  return 1.0 / (1.0 + Math.exp(-sum));
}
