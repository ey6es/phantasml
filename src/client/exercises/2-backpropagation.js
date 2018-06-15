// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {BinaryExercise} from './shared';

const MAX_ITERATIONS = 100000;
const LEARNING_RATE = 1.0;
const TOLERANCE = 0.45;

class BackpropagationExercise extends BinaryExercise {
  _internalWeights: number[][];
  _outputWeights: number[];
  _inputValues: number[];
  _intermediateValues: number[];
  _iterations: number;

  _train() {
    // initialize weights and values to zero
    this._internalWeights = [
      createInitialWeights(3),
      createInitialWeights(3),
      createInitialWeights(3),
    ];
    this._outputWeights = createInitialWeights(4);
    this._inputValues = [0, 0, 1];
    this._intermediateValues = [0, 0, 0, 1];

    // iterate repeatedly over training data
    this._iterations = 1;
    for (; this._iterations <= MAX_ITERATIONS; this._iterations++) {
      var converged = true;
      for (var ii = 0; ii < this.state.trainingData.length; ii++) {
        // see if the output of the model matches the training data
        var observed = this._computeOutput(ii);
        var error = observed - Number(this.state.trainingData[ii]);
        if (Math.abs(error) < TOLERANCE) {
          continue;
        }
        // if not, backpropagate
        converged = false;

        // we update the internal weights first because they depend on the
        // output weights
        var outputDelta = error * observed * (1.0 - observed);
        for (var jj = 0; jj < this._internalWeights.length; jj++) {
          var weights = this._internalWeights[jj];
          var intermediateValue = this._intermediateValues[jj];
          var intermediateDelta =
            this._outputWeights[jj] *
            outputDelta *
            intermediateValue *
            (1.0 - intermediateValue);
          for (var kk = 0; kk < weights.length; kk++) {
            weights[kk] -=
              LEARNING_RATE * intermediateDelta * this._inputValues[kk];
          }
        }

        // now update the output weights
        for (var jj = 0; jj < this._outputWeights.length; jj++) {
          this._outputWeights[jj] -=
            LEARNING_RATE * outputDelta * this._intermediateValues[jj];
        }
      }
      if (converged) {
        return;
      }
    }
  }

  _renderTrainingResults(): React.Element<any> {
    return (
      <div class="titled-table">
        <h4>Internal Weights</h4>
        <table className="table table-bordered table-condensed weight-table">
          <thead>
            <tr>
              <th>A</th>
              <th>B</th>
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
        <table className="table table-bordered table-condensed output-weight-table">
          <thead>
            <tr>
              <th>1</th>
              <th>2</th>
              <th>3</th>
              <th>Bias</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {this._outputWeights.map(weight => <td>{weight.toFixed(3)}</td>)}
            </tr>
          </tbody>
        </table>
        <div>
          {this._iterations < MAX_ITERATIONS
            ? `Converged in ${this._iterations} iteration(s).`
            : 'No convergence.'}
        </div>
      </div>
    );
  }

  _test(index: number): boolean {
    return this._computeOutput(index) > 0.5;
  }

  _computeOutput(index: number): number {
    this._inputValues[0] = index & 2 ? 1.0 : 0.0;
    this._inputValues[1] = index & 1 ? 1.0 : 0.0;
    for (var ii = 0; ii < this._internalWeights.length; ii++) {
      this._intermediateValues[ii] = computeOutput(
        this._inputValues,
        this._internalWeights[ii],
      );
    }
    return computeOutput(this._intermediateValues, this._outputWeights);
  }
}

function createInitialWeights(count: number): number[] {
  var weights = [];
  for (var ii = 0; ii < count; ii++) {
    weights.push(Math.random() - 0.5);
  }
  return weights;
}

function computeOutput(values: number[], weights: number[]): number {
  var sum = 0.0;
  for (var ii = 0; ii < values.length; ii++) {
    sum += values[ii] * weights[ii];
  }
  return 1.0 / (1.0 + Math.exp(-sum));
}

function addToArray(dest: number[], src: number[]) {
  for (var ii = 0; ii < dest.length; ii++) {
    dest[ii] += src[ii];
  }
}

ReactDOM.render(<BackpropagationExercise />, (document.body: any));
