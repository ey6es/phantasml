// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {BinaryExercise} from './shared';

const MAX_ITERATIONS = 10;

class PerceptronExercise extends BinaryExercise {
  _weights: number[];
  _iterations: number;

  _train() {
    // adjust weights based on error using perceptron algorithm
    this._weights = [0.0, 0.0, 0.0];
    this._iterations = 1;
    for (; this._iterations <= MAX_ITERATIONS; this._iterations++) {
      let converged = true;
      for (let ii = 0; ii < this.state.trainingData.length; ii++) {
        let observed = Number(this._test(ii));
        let expected = Number(this.state.trainingData[ii]);
        if (observed === expected) {
          continue;
        }
        converged = false;
        let diff = expected - observed;
        this._weights[0] += diff;
        ii & 2 && (this._weights[1] += diff);
        ii & 1 && (this._weights[2] += diff);
      }
      if (converged) {
        return;
      }
    }
  }

  _renderTrainingResults(): React.Element<any> {
    return (
      <div className="titled-table">
        <h4>Input Weights</h4>
        <table className="table table-bordered table-condensed weight-table">
          <thead>
            <tr>
              <th>Fixed</th>
              <th>A</th>
              <th>B</th>
            </tr>
          </thead>
          <tbody>
            <tr>{this._weights.map(weight => <td>{weight.toString()}</td>)}</tr>
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
    let level =
      this._weights[0] +
      (index & 2 ? this._weights[1] : 0.0) +
      (index & 1 ? this._weights[2] : 0.0);
    return level > 0.0;
  }
}

ReactDOM.render(<PerceptronExercise />, (document.body: any));
