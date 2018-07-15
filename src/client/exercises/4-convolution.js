// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as tf from '@tensorflow/tfjs';
import {createRangeArray} from './shared';

const IMAGE_SIZE = 16;

type TrainingState = 'unstarted' | 'started' | 'finished';

class ConvolutionExercise extends React.Component<
  {},
  {
    patternA: boolean[],
    patternB: boolean[],
    trainingState: TrainingState,
    lastLoss: ?number,
    testPattern: boolean[],
    prediction: ?boolean,
  },
> {
  state = {
    patternA: createRandomPattern(),
    patternB: createRandomPattern(),
    trainingState: 'unstarted',
    lastLoss: null,
    testPattern: createRandomPattern(),
    prediction: null,
  };
  _model: ?tf.Model;
  _testPatternPresets = {
    Random: () => createRandomPattern(),
    'Pattern A': () => this.state.patternA.slice(),
    'Pattern B': () => this.state.patternB.slice(),
    'Pattern A (Rotated)': () => rotatePatternRandomly(this.state.patternA),
    'Pattern B (Rotated)': () => rotatePatternRandomly(this.state.patternB),
  };

  render() {
    return (
      <div className="top">
        <div className="titled-table">
          <PatternEditor
            title="Pattern A"
            pattern={this.state.patternA}
            setPattern={pattern =>
              this.setState({
                patternA: pattern,
                trainingState: 'unstarted',
                lastLoss: null,
                prediction: null,
              })
            }
          />
          <PatternEditor
            title="Pattern B"
            pattern={this.state.patternB}
            setPattern={pattern =>
              this.setState({
                patternB: pattern,
                trainingState: 'unstarted',
                lastLoss: null,
                prediction: null,
              })
            }
          />
          {this.state.trainingState === 'started' ? (
            <button
              className="btn btn-success"
              onClick={() => this.setState({trainingState: 'finished'})}>
              Stop Training
              <span className="glyphicon glyphicon-stop spaced-icon" />
            </button>
          ) : (
            <button className="btn btn-success" onClick={() => this._train()}>
              {this.state.trainingState === 'finished' ? 'Retrain' : 'Train'}
              <span className="glyphicon glyphicon-play spaced-icon" />
            </button>
          )}
          {this.state.lastLoss == null ? null : (
            <span className="loss">Loss: {this.state.lastLoss.toFixed(4)}</span>
          )}
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
          {this.state.prediction === null ? null : (
            <h4 class="prediction">
              {`Prediction: ${this.state.prediction ? 'B' : 'A'}`}
            </h4>
          )}
        </div>
      </div>
    );
  }

  async _train() {
    // train on all rotations of a and b
    const inputs: boolean[] = [];
    const outputs: boolean[] = [];
    const TOTAL_ROTATIONS = IMAGE_SIZE;
    for (let rotation = 0; rotation < TOTAL_ROTATIONS; rotation++) {
      inputs.splice(
        inputs.length,
        0,
        ...rotatePattern(this.state.patternA, rotation),
      );
      outputs.push(false);

      inputs.splice(
        inputs.length,
        0,
        ...rotatePattern(this.state.patternB, rotation),
      );
      outputs.push(true);
    }
    const x = tf.tensor4d(inputs, [TOTAL_ROTATIONS * 2, 1, IMAGE_SIZE, 1]);
    const y = tf.tensor2d(outputs, [TOTAL_ROTATIONS * 2, 1]);

    this.setState({
      trainingState: 'started',
      lastLoss: null,
      prediction: null,
    });

    const model = (this._model = createModel());
    model.compile({optimizer: 'sgd', loss: 'meanSquaredError'});
    while (true) {
      const result = await model.fit(x, y, {epochs: 10});
      this._predict(this.state.testPattern);
      const lastLoss = result.history.loss[result.history.loss.length - 1];
      const LOSS_THRESHOLD = 0.01;
      if (lastLoss < LOSS_THRESHOLD) {
        this.setState({trainingState: 'finished', lastLoss: null});
        break;
      }
      this.setState({lastLoss});
      if (this.state.trainingState !== 'started') {
        break;
      }
      await tf.nextFrame();
    }
    x.dispose();
    y.dispose();
  }

  _setTestPattern(pattern: boolean[]) {
    this.setState({testPattern: pattern, prediction: null});
    this.state.trainingState !== 'unstarted' && this._predict(pattern);
  }

  async _predict(pattern: boolean[]) {
    const model = this._model;
    if (!model) {
      throw new Error('No model available for prediction.');
    }
    const y = tf.tidy(() =>
      model.predict(tf.tensor4d(pattern, [1, 1, IMAGE_SIZE, 1])),
    );
    const output = await y.data();
    y.dispose();
    this.setState({prediction: output[0] > 0.5});
  }
}

function createModel(): tf.Model {
  return tf.sequential({
    layers: [
      tf.layers.conv2d({
        inputShape: [1, IMAGE_SIZE, 1],
        kernelSize: [1, 3],
        filters: 8,
      }),
      tf.layers.maxPooling2d({poolSize: [1, 2]}),
      tf.layers.conv2d({
        kernelSize: [1, 3],
        filters: 8,
      }),
      tf.layers.maxPooling2d({poolSize: [1, 2]}),
      tf.layers.flatten(),
      tf.layers.dense({units: 1, activation: 'tanh'}),
    ],
  });
}

function createRandomPattern(): boolean[] {
  // create a pattern that's half off, half on (so we don't train on count)
  const pattern = createRangeArray(0, IMAGE_SIZE, index => !(index & 1));

  // then shuffle it up
  for (let ii = pattern.length - 1; ii > 0; ii--) {
    const newIndex = Math.floor(Math.random() * (ii + 1));
    const tmp = pattern[newIndex];
    pattern[newIndex] = pattern[ii];
    pattern[ii] = tmp;
  }

  return pattern;
}

function rotatePatternRandomly(pattern: boolean[]): boolean[] {
  return rotatePattern(pattern, Math.floor(Math.random() * pattern.length));
}

function rotatePattern(pattern: boolean[], rotation: number): boolean[] {
  const rotated: boolean[] = [];
  for (let ii = 0; ii < pattern.length; ii++) {
    rotated.push(pattern[(ii + rotation) % pattern.length]);
  }
  return rotated;
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
