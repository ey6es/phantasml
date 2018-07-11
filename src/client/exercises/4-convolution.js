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
    testPattern: boolean[],
    prediction?: boolean,
  },
> {
  state = {
    patternA: createRandomPattern(),
    patternB: createRandomPattern(),
    testPattern: createRandomPattern(),
  };
  _model = tf.sequential({
    layers: [
      tf.layers.conv1d({
        inputShape: [IMAGE_SIZE, 1],
        kernelSize: IMAGE_SIZE,
        filters: 1,
      }),
      tf.layers.dense({units: 1, activation: 'sigmoid'}),
    ],
  });

  constructor() {
    super();
    this._model.compile({optimizer: 'sgd', loss: 'meanSquaredError'});
  }

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
          <button className="btn btn-success" onClick={() => this._train()}>
            Train
          </button>
        </div>
        <div className="titled-table">
          <PatternEditor
            title="Test Pattern"
            pattern={this.state.testPattern}
            setPattern={pattern => {
              this.setState({testPattern: pattern});
              this._predict(pattern);
            }}
          />
          {this.state.prediction === undefined ? null : (
            <h4>{`Prediction: ${this.state.prediction ? 'B' : 'A'}`}</h4>
          )}
        </div>
      </div>
    );
  }

  async _train() {
    let inputs = this.state.patternA.concat(this.state.patternB);
    let outputs = [false, true];
    await this._model.fit(
      tf.tensor3d(inputs, [2, IMAGE_SIZE, 1]),
      tf.tensor3d(outputs, [2, 1, 1]),
      {epochs: 10},
    );
    this._predict(this.state.testPattern);
  }

  async _predict(pattern: boolean[]) {
    let result = await this._model
      .predict(tf.tensor3d(pattern, [1, IMAGE_SIZE, 1]))
      .data();
    this.setState({prediction: result[0] > 0.5});
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
