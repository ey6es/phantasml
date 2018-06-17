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
