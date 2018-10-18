// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {
  BinaryExercise,
  computeLogisticOutput,
  createRandomWeights,
} from './shared';

const MAX_ITERATIONS = 10000;
const LEARNING_RATE = 1.0;
const TOLERANCE = 0.1;

class BackpropagationExercise extends BinaryExercise {
  _internalWeights: number[][];
  _outputWeights: number[];
  _inputValues: number[];
  _intermediateValues: number[];
  _iterations: number;

  _train() {
    // initialize weights and values
    this._internalWeights = [
      createRandomWeights(3),
      createRandomWeights(3),
      createRandomWeights(3),
    ];
    this._outputWeights = createRandomWeights(4);
    this._inputValues = [0, 0, 1];
    this._intermediateValues = [0, 0, 0, 1];

    // iterate repeatedly over training data
    this._iterations = 1;
    for (; this._iterations <= MAX_ITERATIONS; this._iterations++) {
      let converged = true;
      for (let ii = 0; ii < this.state.trainingData.length; ii++) {
        // see if the output of the model matches the training data
        let observed = this._computeOutput(ii);
        let error = observed - Number(this.state.trainingData[ii]);
        if (Math.abs(error) > TOLERANCE) {
          converged = false;
        }
        // we update the internal weights first because they depend on the
        // output weights
        let outputDelta = error * observed * (1.0 - observed);
        for (let jj = 0; jj < this._internalWeights.length; jj++) {
          let weights = this._internalWeights[jj];
          let intermediateValue = this._intermediateValues[jj];
          let intermediateDelta =
            this._outputWeights[jj] *
            outputDelta *
            intermediateValue *
            (1.0 - intermediateValue);
          for (let kk = 0; kk < weights.length; kk++) {
            weights[kk] -=
              LEARNING_RATE * intermediateDelta * this._inputValues[kk];
          }
        }

        // now update the output weights
        for (let jj = 0; jj < this._outputWeights.length; jj++) {
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
      <div className="titled-table">
        <h5>Internal Weights</h5>
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
        <h5>Output Weights</h5>
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
    for (let ii = 0; ii < this._internalWeights.length; ii++) {
      this._intermediateValues[ii] = computeLogisticOutput(
        this._inputValues,
        this._internalWeights[ii],
      );
    }
    return computeLogisticOutput(this._intermediateValues, this._outputWeights);
  }
}

ReactDOM.render(<BackpropagationExercise />, (document.body: any));
