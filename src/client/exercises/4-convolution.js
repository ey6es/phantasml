// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as tf from '@tensorflow/tfjs';
import {createRangeArray} from './shared';

const IMAGE_SIZE = 16;

class ConvolutionExercise extends React.Component<
  {},
  {
    patternA: boolean[],
    patternB: boolean[],
    trained: boolean,
    testPattern: boolean[],
  },
> {
  state = {
    patternA: createRandomPattern(),
    patternB: createRandomPattern(),
    trained: false,
    testPattern: createRandomPattern(),
  };

  render() {
    return (
      <div className="top">
        <div className="titled-table">
          <PatternEditor
            title="Pattern A"
            pattern={this.state.patternA}
            setPattern={pattern => this.setState({patternA: pattern})}
          />
          <PatternEditor
            title="Pattern B"
            pattern={this.state.patternB}
            setPattern={pattern => this.setState({patternB: pattern})}
          />
          <button className="btn btn-success">Train</button>
        </div>
        <div className="titled-table">
          <PatternEditor
            title="Test Pattern"
            pattern={this.state.testPattern}
            setPattern={pattern => this.setState({testPattern: pattern})}
          />
        </div>
      </div>
    );
  }
}

function createRandomPattern(): boolean[] {
  return createRangeArray(0, IMAGE_SIZE, () => Math.random() < 0.5);
}

function PatternEditor(props: {
  title: string,
  pattern: boolean[],
  setPattern: (newPattern: boolean[]) => void,
}) {
  return [
    <h4>{props.title}</h4>,
    <div className="pattern">
      {props.pattern.map((value, index) => (
        <div
          className={`pattern-element${value ? ' active' : ''}`}
          onMouseDown={() => {
            const newPattern = props.pattern.slice();
            newPattern[index] = !value;
            props.setPattern(newPattern);
          }}
        />
      ))}
    </div>,
  ];
}

ReactDOM.render(<ConvolutionExercise />, (document.body: any));
