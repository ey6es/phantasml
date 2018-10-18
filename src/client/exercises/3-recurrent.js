// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {
  computeLogisticOutput,
  createRangeArray,
  createRandomWeights,
} from './shared';

type TestResult = {
  id: number,
  input: boolean,
  trainingOutput: boolean,
  modelOutput: boolean,
};

type HistoryEntry = {
  inputs: number[],
  trainingOutput: number,
  modelOutput: number,
};

const STEP_DELAY = 10;
const STEP_DISPLAY_COUNT = 5;
const MAX_ITERATIONS = 100000;
const LEARNING_RATE = 0.0001;
const TOLERANCE = 0.1;
const UNFOLD_LENGTH = 2;

class RecurrentExercise extends React.Component<
  {},
  {trainingData: boolean[][], testResults: TestResult[], running: boolean},
> {
  state = {
    trainingData: [[false, true, true, false], [false, false, false, true]],
    testResults: [],
    running: false,
  };
  _intervalId: ?IntervalID;
  _stepId: number;
  _trainingState: boolean;
  _internalWeights = [[0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]];
  _outputWeights = [0.0, 0.0, 0.0];
  _hiddenOutputs: number[];
  _history: HistoryEntry[];

  componentWillUnmount() {
    this._intervalId && clearInterval(this._intervalId);
  }

  render() {
    return (
      <div className="top">
        <div className="titled-table">
          <h5>Training Data</h5>
          <table className="table table-bordered table-condensed truth-table">
            <thead>
              <tr>
                <th>State</th>
                <th>Input</th>
                <th className="first-output-cell">Next</th>
                <th className="output-cell">Output</th>
              </tr>
            </thead>
            <tbody>
              {createRangeArray(0, 4, index => (
                <tr>
                  <td>{Boolean(index & 2).toString()}</td>
                  <td>{Boolean(index & 1).toString()}</td>
                  <td className="first-output-cell">
                    <input
                      type="checkbox"
                      checked={this.state.trainingData[0][index]}
                      onChange={event => {
                        let checked = event.target.checked;
                        this.setState(
                          state => (state.trainingData[0][index] = checked),
                        );
                      }}
                    />
                  </td>
                  <td className="output-cell">
                    <input
                      type="checkbox"
                      checked={this.state.trainingData[1][index]}
                      onChange={event => {
                        let checked = event.target.checked;
                        this.setState(
                          state => (state.trainingData[1][index] = checked),
                        );
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="btn btn-success"
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
          <h5>Internal Weights</h5>
          <table className="table table-bordered table-condensed recurrent-weight-table">
            <thead>
              <tr>
                <th>
                  A<sub>t-1</sub>
                </th>
                <th>
                  B<sub>t-1</sub>
                </th>
                <th>Input</th>
                <th>Bias</th>
              </tr>
            </thead>
            <tbody>
              {this._internalWeights.map(weights => (
                <tr>{weights.map(weight => <td>{weight.toFixed(3)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <h5>Output Weights</h5>
          <table className="table table-bordered table-condensed weight-table">
            <thead>
              <tr>
                <th>A</th>
                <th>B</th>
                <th>Bias</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {this._outputWeights.map(weight => (
                  <td>{weight.toFixed(3)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="titled-table">
          <h5>Test Results</h5>
          <table className="table table-bordered table-condensed recurrent-results">
            <thead>
              <tr>
                <th>Step</th>
                <th>Input</th>
                <th className="first-output-cell">Training</th>
                <th className="output-cell">Model</th>
              </tr>
            </thead>
            <tbody>
              {this.state.testResults.map(result => (
                <tr>
                  <td>{result.id.toString()}</td>
                  <td>{result.input.toString()}</td>
                  <td className="first-output-cell">
                    {result.trainingOutput.toString()}
                  </td>
                  <td
                    className={
                      'output-cell' +
                      (result.trainingOutput === result.modelOutput
                        ? ''
                        : ' error')
                    }>
                    {result.modelOutput.toString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  _toggleRunning() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      delete this._intervalId;
      this.setState({running: false});
    } else {
      this._stepId = 0;
      this._trainingState = randomBoolean();
      this._internalWeights = [createRandomWeights(4), createRandomWeights(4)];
      this._outputWeights = createRandomWeights(3);
      this._hiddenOutputs = [0.0, 0.0];
      this._history = [];
      this._intervalId = setInterval(() => this._step(), STEP_DELAY);
      this.setState({running: true});
    }
  }

  _step() {
    let testResults = this.state.testResults.slice();
    let input = randomBoolean();
    let index = (Number(this._trainingState) << 1) | Number(input);
    this._trainingState = this.state.trainingData[0][index];
    let trainingOutput = this.state.trainingData[1][index];
    let modelOutput = this._computeOutputAndTrain(input, trainingOutput);
    testResults.push({
      id: this._stepId++,
      input,
      trainingOutput,
      modelOutput,
    });
    while (testResults.length > STEP_DISPLAY_COUNT) {
      testResults.shift();
    }
    this.setState({testResults});
  }

  _computeOutputAndTrain(input: boolean, trainingOutput: boolean): boolean {
    // add latest input to history along with current state
    let latestInputs = this._hiddenOutputs.concat([Number(input), 1.0]);
    let latestEntry = {
      inputs: latestInputs,
      trainingOutput: Number(trainingOutput),
      modelOutput: 0.0,
    };
    this._history.push(latestEntry);
    while (this._history.length > UNFOLD_LENGTH) {
      this._history.shift();
    }

    // evaluate once to see if we're already converged
    let converged = this._evaluateModel();
    let initialResult = latestEntry.modelOutput > 0.5;
    if (converged) {
      return initialResult;
    }

    // iterate until convergence
    let iterations = 0;
    for (; iterations < MAX_ITERATIONS; iterations++) {
      // step back through history
      let outputWeightOffsets = [0.0, 0.0, 0.0];
      let internalWeightOffsets = [[0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]];
      let deltas = [0.0, 0.0];
      for (let ii = this._history.length - 1; ii >= 0; ii--) {
        // update output offsets
        let entry = this._history[ii];
        let output = entry.modelOutput;
        let error = output - entry.trainingOutput;
        let outputDelta = error * output * (1.0 - output);
        let inputs: number[];
        if (ii === this._history.length - 1) {
          inputs = this._hiddenOutputs.concat([1.0]);
        } else {
          let nextInputs = this._history[ii + 1].inputs;
          inputs = [nextInputs[0], nextInputs[1], 1.0];
        }
        for (let jj = 0; jj < outputWeightOffsets.length; jj++) {
          outputWeightOffsets[jj] -= LEARNING_RATE * outputDelta * inputs[jj];
        }

        // then internal ones
        let nextDeltas: number[] = [];
        for (let jj = 0; jj < internalWeightOffsets.length; jj++) {
          let offsets = internalWeightOffsets[jj];
          let intermediateOutput = inputs[jj];
          let delta =
            (this._outputWeights[jj] * outputDelta +
              this._internalWeights[0][jj] * deltas[0] +
              this._internalWeights[1][jj] * deltas[1]) *
            intermediateOutput *
            (1.0 - intermediateOutput);
          nextDeltas[jj] = delta;
          for (let kk = 0; kk < offsets.length; kk++) {
            offsets[kk] -= LEARNING_RATE * delta * entry.inputs[kk];
          }
        }
        deltas = nextDeltas;
      }

      // apply weight offsets we accumulated
      for (let ii = 0; ii < internalWeightOffsets.length; ii++) {
        addToArray(this._internalWeights[ii], internalWeightOffsets[ii]);
      }
      addToArray(this._outputWeights, outputWeightOffsets);

      // reevaluate model, breaking if we've converged
      if (this._evaluateModel()) {
        break;
      }
    }

    // return the first result we got to show how the model is doing
    return initialResult;
  }

  _evaluateModel(): boolean {
    let converged = true;
    for (let ii = 0; ii < this._history.length; ii++) {
      let entry = this._history[ii];
      let hiddenOutputs = [
        computeLogisticOutput(entry.inputs, this._internalWeights[0]),
        computeLogisticOutput(entry.inputs, this._internalWeights[1]),
      ];
      entry.modelOutput = computeLogisticOutput(
        hiddenOutputs.concat([1.0]),
        this._outputWeights,
      );
      let error = entry.modelOutput - entry.trainingOutput;
      if (Math.abs(error) > TOLERANCE) {
        converged = false;
      }
      if (ii === this._history.length - 1) {
        this._hiddenOutputs = hiddenOutputs;
      } else {
        let nextEntry = this._history[ii + 1];
        nextEntry.inputs[0] = hiddenOutputs[0];
        nextEntry.inputs[1] = hiddenOutputs[1];
      }
    }
    return converged;
  }
}

function randomBoolean(): boolean {
  return Math.random() < 0.5;
}

function addToArray(dest: number[], src: number[]) {
  for (let ii = 0; ii < dest.length; ii++) {
    dest[ii] += src[ii];
  }
}

ReactDOM.render(<RecurrentExercise />, (document.body: any));
