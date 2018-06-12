// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';

class Exercise extends React.Component<{}, {trainingData: boolean[]}> {
  state = {trainingData: [false, false, false, false]};

  render() {
    return (
      <div className="top">
        <TruthTable
          generateResult={index => (
            <input
              type="checkbox"
              checked={this.state[index]}
              onChange={event => {
                var checked = event.target.checked;
                this.setState(state => (state.trainingData[index] = checked));
              }}
            />
          )}
        />
      </div>
    );
  }
}

ReactDOM.render(<Exercise />, (document.body: any));

function TruthTable(props: {generateResult: number => React.Element<any>}) {
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
  );
}
