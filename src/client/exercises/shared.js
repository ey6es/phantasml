// @flow

import * as React from 'react';
import type {AbstractSbrrn} from '../models/sbrrn';
import {StateVisualizer, TextureVisualizer} from '../models/sbrrn';

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
    let data = [];
    for (let ii = 0; ii < 4; ii++) {
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
                let checked = event.target.checked;
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
              <option className="hidden" value="">
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
    <div className="titled-table">
      <h5>{props.title}</h5>
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
  let array = [];
  for (let ii = start; ii < end; ii++) {
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
  let weights = [];
  for (let ii = 0; ii < count; ii++) {
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
  let sum = 0.0;
  for (let ii = 0; ii < inputs.length; ii++) {
    sum += inputs[ii] * weights[ii];
  }
  return 1.0 / (1.0 + Math.exp(-sum));
}

const STEP_DELAY = 10;

const REWARD_FUNCTIONS: {[string]: (boolean, boolean) => number} = {
  Output: (input, output) => (output ? 1 : -0.001),
  'Not Output': (input, output) => (output ? -0.001 : 1),
  None: (input, output) => 0,
};

/**
 * Base class for SBRRN exercises.
 */
export class AbstractSbrrnExercise extends React.Component<
  {},
  {
    width: number,
    height: number,
    probabilityLimit: number,
    historyDecayRate: number,
    includeSelfInputs: boolean,
    rewardFunction: string,
    running: boolean,
    averageOutput: number,
  },
> {
  state = {
    width: 8,
    height: 8,
    probabilityLimit: 2.0,
    historyDecayRate: 0.5,
    includeSelfInputs: true,
    rewardFunction: 'Output',
    running: false,
    averageOutput: 0.0,
  };

  _intervalId: ?IntervalID;
  _stepCounter = 0;
  _modelCanvas: ?HTMLCanvasElement;
  _visualizerCanvas: ?HTMLCanvasElement;
  _textureCanvas: ?HTMLCanvasElement;
  _model: ?AbstractSbrrn;
  _visualizer: ?StateVisualizer;
  _textureVisualizer: ?TextureVisualizer;

  render() {
    return (
      <div className="top">
        <div className="titled-table">
          <h5>Controls</h5>
          <form className="form-horizontal">
            <div className="form-group">
              <label className="control-label" for="width">
                Width:
              </label>
              <input
                type="number"
                className="form-control"
                id="width"
                value={this.state.width}
                min={1}
                disabled={this.state.running}
                onChange={event =>
                  this.setState({
                    width: parseInt(event.target.value),
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="control-label" for="height">
                Height:
              </label>
              <input
                type="number"
                className="form-control"
                id="height"
                value={this.state.height}
                min={1}
                disabled={this.state.running}
                onChange={event =>
                  this.setState({
                    height: parseInt(event.target.value),
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="control-label" for="probability-limit">
                Probability Limit:
              </label>
              <input
                type="number"
                className="form-control"
                id="probability-limit"
                min={0.0}
                step={0.1}
                disabled={this.state.running}
                value={this.state.probabilityLimit}
                onChange={event =>
                  this.setState({
                    probabilityLimit: parseFloat(event.target.value),
                  })
                }
              />
            </div>
            {this._renderCustomControls()}
            <div className="form-group">
              <div class="checkbox">
                <label className="control-label">
                  <input
                    type="checkbox"
                    checked={this.state.includeSelfInputs}
                    disabled={this.state.running}
                    onChange={event =>
                      this.setState({includeSelfInputs: event.target.checked})
                    }
                  />
                  Include self-inputs
                </label>
              </div>
            </div>
          </form>
        </div>
        <div className="titled-table">
          <h5>Reward Function</h5>
          <select
            value={this.state.rewardFunction}
            onChange={event =>
              this.setState({rewardFunction: event.target.value})
            }>
            {Object.keys(REWARD_FUNCTIONS).map(name => (
              <option value={name}>{name}</option>
            ))}
          </select>
          <button
            className="btn btn-success running-toggle"
            onClick={() => this._toggleRunning()}>
            {this.state.running ? (
              <span>
                Stop <span className="glyphicon glyphicon-stop" />
              </span>
            ) : (
              <span>
                Start <span className="glyphicon glyphicon-play" />
              </span>
            )}
          </button>
        </div>
        <div className="titled-table">
          <h5>State Array</h5>
          <canvas className="states" ref={this._modelCanvasRef} />
          <h5 className="visualizer-title">Output</h5>
          <span className="pb-3">
            <canvas className="visualizer" ref={this._visualizerCanvasRef} />
            {' ' + this.state.averageOutput.toFixed(2)}
          </span>
          <h5>Probabilities</h5>
          <canvas className="states" ref={this._textureCanvasRef} />
        </div>
      </div>
    );
  }

  _renderCustomControls(): any {
    return null;
  }

  _modelCanvasRef = (element: ?HTMLElement) => {
    this._modelCanvas = (element: any);
  };

  _visualizerCanvasRef = (element: ?HTMLElement) => {
    this._visualizerCanvas = (element: any);
  };

  _textureCanvasRef = (element: ?HTMLElement) => {
    this._textureCanvas = (element: any);
  };

  componentWillUnmount() {
    this._model && this._model.dispose();
    this._intervalId && clearInterval(this._intervalId);
  }

  _toggleRunning() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      delete this._intervalId;
      this.setState({running: false});
    } else {
      this._model && this._model.dispose();
      const model = (this._model = this._createModel());
      model.step(0.0); // step once to make frame buffer valid
      this._visualizer = new StateVisualizer(
        model,
        [{x: Math.floor(this.state.width / 2), y: 0}],
        64,
        '#FFF',
        '#000',
        this._visualizerCanvas,
      );
      this._textureVisualizer = new TextureVisualizer(
        model,
        'probability',
        true,
        this._textureCanvas,
      );
      this._intervalId = setInterval(this._step, STEP_DELAY);
      this.setState({running: true});
    }
  }

  _createModel(): AbstractSbrrn {
    throw new Error('Not implemented');
  }

  _step = () => {
    const model = this._model;
    if (!model) {
      return;
    }
    model.step(
      REWARD_FUNCTIONS[this.state.rewardFunction](
        false,
        model.getState(Math.floor(this.state.width / 2), 0),
      ),
    );
    const visualizer = this._visualizer;
    if (visualizer) {
      visualizer.update();
      // update the average display five times per second
      if ((this._stepCounter = (this._stepCounter + 1) % 20) === 0) {
        this.setState({averageOutput: visualizer.averageStates[0]});
      }
    }
    this._textureVisualizer && this._textureVisualizer.update();
  };
}
