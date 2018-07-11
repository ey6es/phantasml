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
      tf.layers.dense({
        inputShape: [IMAGE_SIZE],
        units: 1,
        activation: 'sigmoid',
      }),
    ],
  });
  _testPatternPresets = {
    Random: () => createRandomPattern(),
    'Pattern A': () => this.state.patternA.slice(),
    'Pattern B': () => this.state.patternB.slice(),
  };

  constructor() {
    super();
    this._model.compile({optimizer: 'sgd', loss: 'meanSquaredError'});
    this._train();
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
            setPattern={pattern => this._setTestPattern(pattern)}
          />
          <select
            value=""
            onChange={event =>
              this._setTestPattern(
                this._testPatternPresets[event.target.value](),
              )
            }>
            <option className="hidden" value="">
              Presets
            </option>
            {Object.keys(this._testPatternPresets).map(key => (
              <option value={key}>{key}</option>
            ))}
          </select>
          {this.state.prediction === undefined ? null : (
            <h4 class="prediction">
              {`Prediction: ${this.state.prediction ? 'B' : 'A'}`}
            </h4>
          )}
        </div>
      </div>
    );
  }

  async _train() {
    let inputs = this.state.patternA.concat(this.state.patternB);
    let outputs = [false, true];
    await this._model.fit(
      tf.tensor2d(inputs, [2, IMAGE_SIZE]),
      tf.tensor2d(outputs, [2, 1]),
      {epochs: 1000},
    );
    this._predict(this.state.testPattern);
  }

  _setTestPattern(pattern: boolean[]) {
    this.setState({testPattern: pattern});
    this._predict(pattern);
  }

  async _predict(pattern: boolean[]) {
    let result = await this._model
      .predict(tf.tensor2d(pattern, [1, IMAGE_SIZE]))
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
