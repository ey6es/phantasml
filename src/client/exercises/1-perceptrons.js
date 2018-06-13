// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';

const Presets = [
  ['False', [false, false, false, false]],
  ['True', [true, true, true, true]],
  ['A', [false, false, true, true]],
  ['B', [false, true, false, true]],
  ['Not A', [true, true, false, false]],
  ['Not B', [true, false, true, false]],
  ['A or B', [false, true, true, true]],
  ['A and B', [false, false, false, true]],
  ['A nor B', [true, false, false, false]],
  ['A nand B', [true, true, true, false]],
  ['A xor B', [false, true, true, false]],
  ['A xnor B', [true, false, false, true]],
];

const MAX_ITERATIONS = 10;

class Exercise extends React.Component<{}, {trainingData: boolean[]}> {
  state = {trainingData: [false, false, false, false]};

  render() {
    // "train": adjust weights based on error using perceptron algorithm
    var weights = [0.0, 0.0, 0.0];
    var computeLevel = index =>
      weights[0] +
      (index & 2 ? weights[1] : 0.0) +
      (index & 1 ? weights[2] : 0.0);
    var iterations = 1;
    for (; iterations <= MAX_ITERATIONS; iterations++) {
      var converged = true;
      for (var jj = 0; jj < this.state.trainingData.length; jj++) {
        var observed = Number(computeLevel(jj) > 0.0);
        var expected = Number(this.state.trainingData[jj]);
        if (observed === expected) {
          continue;
        }
        converged = false;
        var diff = expected - observed;
        weights[0] += diff;
        jj & 2 && (weights[1] += diff);
        jj & 1 && (weights[2] += diff);
      }
      if (converged) {
        break;
      }
    }

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
            <div class="dropdown">
              <button
                class="btn btn-success dropdown-toggle"
                type="button"
                data-toggle="dropdown">
                Presets <span class="caret" />
              </button>
              <ul class="dropdown-menu">
                {Presets.map(([name, data]) => (
                  <li>
                    <a
                      class="link-button"
                      onClick={() =>
                        this.setState({trainingData: data.slice()})
                      }>
                      {name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          }
        />
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
              <tr>{weights.map(weight => <td>{weight.toPrecision(1)}</td>)}</tr>
            </tbody>
          </table>
          <h4>
            {iterations < MAX_ITERATIONS
              ? `Converged in ${iterations} iteration(s).`
              : 'No convergence.'}
          </h4>
        </div>
        <TruthTable
          title="Test Results"
          generateResult={index =>
            Boolean(computeLevel(index) > 0.0).toString()
          }
        />
      </div>
    );
  }
}

ReactDOM.render(<Exercise />, (document.body: any));

function TruthTable(props: {
  title: string,
  generateResult: number => React.Element<any> | string,
  footer?: React.Element<any>,
}) {
  var rows = [];
  for (var ii = 0; ii < 4; ii++) {
    rows.push(
      <tr>
        <td>{Boolean(ii & 2).toString()}</td>
        <td>{Boolean(ii & 1).toString()}</td>
        <td className="output-cell">{props.generateResult(ii)}</td>
      </tr>,
    );
  }
  return (
    <div class="titled-table">
      <h4>{props.title}</h4>
      <table className="table table-bordered table-condensed truth-table">
        <thead>
          <tr>
            <th>Input A</th>
            <th>Input B</th>
            <th className="output-cell">Output</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      {props.footer}
    </div>
  );
}
