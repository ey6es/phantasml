// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {createRangeArray} from './shared';

class RecurrentExercise extends React.Component<
  {},
  {trainingData: boolean[][]},
> {
  state = {
    trainingData: [[false, false, false, false], [false, false, false, false]],
  };

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
        </div>
      </div>
    );
  }
}

ReactDOM.render(<RecurrentExercise />, (document.body: any));
