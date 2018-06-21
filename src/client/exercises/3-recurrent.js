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

const ITERATION_DELAY = 10;
const ITERATION_DISPLAY_COUNT = 5;
const LEARNING_RATE = 1.0;
const UNFOLD_LENGTH = 10;

class RecurrentExercise extends React.Component<
  {},
  {trainingData: boolean[][], testResults: TestResult[], running: boolean},
> {
  state = {
    trainingData: [[false, true, true, false], [false, true, true, false]],
    testResults: [],
    running: false,
  };
  _intervalId: ?IntervalID;
  _iterationId: number;
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
        <div class="titled-table">
          <h4>Training Data</h4>
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
                        var checked = event.target.checked;
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
                        var checked = event.target.checked;
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
          <button class="btn btn-success" onClick={() => this._toggleRunning()}>
            {this.state.running ? (
              <span>
                Stop <span class="glyphicon glyphicon-stop" />
              </span>
            ) : (
              <span>
                Start <span class="glyphicon glyphicon-play" />
              </span>
            )}
          </button>
        </div>
        <div class="titled-table">
          <h4>Internal Weights</h4>
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
          <h4>Output Weights</h4>
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
        <div class="titled-table">
          <h4>Test Results</h4>
          <table className="table table-bordered table-condensed recurrent-results">
            <thead>
              <tr>
                <th>Iteration</th>
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
                  <td class="first-output-cell">
                    {result.trainingOutput.toString()}
                  </td>
                  <td
                    class={
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
      this._iterationId = 0;
      this._trainingState = randomBoolean();
      this._internalWeights = [createRandomWeights(4), createRandomWeights(4)];
      this._outputWeights = createRandomWeights(3);
      this._hiddenOutputs = [0.0, 0.0];
      this._history = [];
      this._intervalId = setInterval(() => this._iterate(), ITERATION_DELAY);
      this.setState({running: true});
    }
  }

  _iterate() {
    var testResults = this.state.testResults.slice();
    var input = randomBoolean();
    var index = (Number(this._trainingState) << 1) | Number(input);
    this._trainingState = this.state.trainingData[0][index];
    var trainingOutput = this.state.trainingData[1][index];
    var modelOutput = this._computeOutputAndTrain(input, trainingOutput);
    testResults.push({
      id: this._iterationId++,
      input,
      trainingOutput,
      modelOutput,
    });
    while (testResults.length > ITERATION_DISPLAY_COUNT) {
      testResults.shift();
    }
    this.setState({testResults});
  }

  _computeOutputAndTrain(input: boolean, trainingOutput: boolean): boolean {
    // add latest input to history along with current state
    var latestInputs = this._hiddenOutputs.concat([Number(input), 1.0]);
    this._history.push({
      inputs: latestInputs,
      trainingOutput: Number(trainingOutput),
      modelOutput: 0.0,
    });
    while (this._history.length > UNFOLD_LENGTH) {
      this._history.shift();
    }

    // evaluate unfolded model
    var hiddenOutputs = this._computeHiddenOutputs();
    var intermediateOutputs = hiddenOutputs.concat([1.0]);
    var output = computeLogisticOutput(
      intermediateOutputs,
      this._outputWeights,
    );
    var error = output - Number(trainingOutput);

    // backpropagate error, accumulating weight offsets; start with output
    var outputDelta = error * output * (1.0 - output);
    var outputWeightOffsets = [0.0, 0.0, 0.0];
    for (var ii = 0; ii < outputWeightOffsets.length; ii++) {
      outputWeightOffsets[ii] -=
        LEARNING_RATE * outputDelta * intermediateOutputs[ii];
    }

    // proceed to first internal weights
    var internalWeightOffsets = [[0.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]];
    var intermediateDeltas: number[] = [];
    for (var ii = 0; ii < internalWeightOffsets.length; ii++) {
      var offsets = internalWeightOffsets[ii];
      var intermediateOutput = intermediateOutputs[ii];
      var intermediateDelta =
        this._outputWeights[ii] *
        outputDelta *
        intermediateOutput *
        (1.0 - intermediateOutput);
      intermediateDeltas[ii] = intermediateDelta;
      for (var jj = 0; jj < offsets.length; jj++) {
        offsets[jj] -= LEARNING_RATE * intermediateDelta * latestInputs[jj];
      }
    }

    // step back through history
    for (var ii = this._history.length - 2; ii >= 0; ii--) {
      // update output offsets
      var entry = this._history[ii];
      var inputs = entry.inputs;
      var intermediateInputs = [inputs[0], inputs[1], 1.0];
      var intermediateError = entry.modelOutput - entry.trainingOutput;
      var intermediateOutputDelta =
        intermediateError * entry.modelOutput * (1.0 - entry.modelOutput);
      for (var jj = 0; jj < outputWeightOffsets.length; jj++) {
        outputWeightOffsets[jj] -=
          LEARNING_RATE * intermediateOutputDelta * intermediateInputs[jj];
      }

      // then internal ones
      var outputs = this._history[ii + 1].inputs;
      var nextIntermediateDeltas: number[] = [];
      for (var jj = 0; jj < internalWeightOffsets.length; jj++) {
        var weights = this._internalWeights[jj];
        var offsets = internalWeightOffsets[jj];
        var intermediateOutput = outputs[jj];
        var intermediateDelta =
          (weights[0] * intermediateDeltas[0] +
            weights[1] * intermediateDeltas[1]) *
          intermediateOutput *
          (1.0 - intermediateOutput);
        nextIntermediateDeltas[jj] = intermediateDelta;
        for (var kk = 0; kk < offsets.length; kk++) {
          offsets[kk] -= LEARNING_RATE * intermediateDelta * inputs[jj];
        }
      }
      intermediateDeltas = nextIntermediateDeltas;
    }

    // apply weight offsets we accumulated
    for (var ii = 0; ii < internalWeightOffsets.length; ii++) {
      addToArray(this._internalWeights[ii], internalWeightOffsets[ii]);
    }
    addToArray(this._outputWeights, outputWeightOffsets);

    // reevaluate for state
    this._hiddenOutputs = this._computeHiddenOutputs();

    return output > 0.5;
  }

  _computeHiddenOutputs(): number[] {
    for (var ii = 1; ii < this._history.length; ii++) {
      var entry = this._history[ii - 1];
      var inputs = entry.inputs;
      var outputs = this._history[ii].inputs;
      outputs[0] = computeLogisticOutput(inputs, this._internalWeights[0]);
      outputs[1] = computeLogisticOutput(inputs, this._internalWeights[1]);
      entry.modelOutput = computeLogisticOutput(
        [outputs[0], outputs[1], 1.0],
        this._outputWeights,
      );
    }
    var latestInputs = this._history[this._history.length - 1].inputs;
    return [
      computeLogisticOutput(latestInputs, this._internalWeights[0]),
      computeLogisticOutput(latestInputs, this._internalWeights[1]),
    ];
  }
}

function randomBoolean(): boolean {
  return Math.random() < 0.5;
}

function addToArray(dest: number[], src: number[]) {
  for (var ii = 0; ii < dest.length; ii++) {
    dest[ii] += src[ii];
  }
}

ReactDOM.render(<RecurrentExercise />, (document.body: any));
