// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {BinaryExercise} from './shared';

const MAX_ITERATIONS = 10;

class PerceptronsExercise extends BinaryExercise {
  _weights: number[];
  _iterations: number;

  _train() {
    // adjust weights based on error using perceptron algorithm
    this._weights = [0.0, 0.0, 0.0];
    this._iterations = 1;
    for (; this._iterations <= MAX_ITERATIONS; this._iterations++) {
      var converged = true;
      for (var ii = 0; ii < this.state.trainingData.length; ii++) {
        var observed = Number(this._test(ii));
        var expected = Number(this.state.trainingData[ii]);
        if (observed === expected) {
          continue;
        }
        converged = false;
        var diff = expected - observed;
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
      <div class="titled-table">
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
    var level =
      this._weights[0] +
      (index & 2 ? this._weights[1] : 0.0) +
      (index & 1 ? this._weights[2] : 0.0);
    return level > 0.0;
  }
}

ReactDOM.render(<PerceptronsExercise />, (document.body: any));
