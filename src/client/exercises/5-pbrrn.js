// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {Pbrrn, StateVisualizer} from '../models/pbrrn';

const STEP_DELAY = 10;

const REWARD_FUNCTIONS: {[string]: (boolean, boolean) => number} = {
  Output: (input, output) => (output ? 1 : -0.01),
  'Not Output': (input, output) => (output ? -0.01 : 1),
  None: (input, output) => 0,
};

class PbrrnExercise extends React.Component<
  {},
  {
    width: number,
    height: number,
    probabilityLimit: number,
    historyDecayRate: number,
    rewardFunction: string,
    running: boolean,
  },
> {
  state = {
    width: 8,
    height: 8,
    probabilityLimit: 6.0,
    historyDecayRate: 0.1,
    rewardFunction: 'Output',
    running: false,
  };

  _intervalId: ?IntervalID;
  _container: ?HTMLElement;
  _visualizerContainer: ?HTMLElement;
  _model: ?Pbrrn;
  _visualizer: ?StateVisualizer;

  render() {
    return (
      <div className="top">
        <div className="titled-table">
          <h4>Controls</h4>
          <form className="form-horizontal">
            <div className="form-group">
              <label className="control-label" for="width">
                Width:
              </label>
              <input
                type="number"
                className="form-control"
                id="width"
                value={this.state.width}
                min={8}
                disabled={this.state.running}
                onChange={event =>
                  this.setState({
                    width: parseInt(event.target.value),
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="control-label" for="height">
                Height:
              </label>
              <input
                type="number"
                className="form-control"
                id="height"
                value={this.state.height}
                min={8}
                disabled={this.state.running}
                onChange={event =>
                  this.setState({
                    height: parseInt(event.target.value),
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="control-label" for="probability-limit">
                Probability Limit:
              </label>
              <input
                type="number"
                className="form-control"
                id="probability-limit"
                min={0.0}
                step={0.1}
                disabled={this.state.running}
                value={this.state.probabilityLimit}
                onChange={event =>
                  this.setState({
                    probabilityLimit: parseFloat(event.target.value),
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="control-label" for="history-decay-rate">
                History Decay Rate:
              </label>
              <input
                type="number"
                className="form-control"
                id="history-decay-rate"
                min={0.0}
                max={1.0}
                step={0.001}
                disabled={this.state.running}
                value={this.state.historyDecayRate}
                onChange={event =>
                  this.setState({
                    historyDecayRate: parseFloat(event.target.value),
                  })
                }
              />
            </div>
          </form>
        </div>
        <div className="titled-table">
          <h4>Reward Function</h4>
          <select
            value={this.state.rewardFunction}
            onChange={event =>
              this.setState({rewardFunction: event.target.value})
            }>
            {Object.keys(REWARD_FUNCTIONS).map(name => (
              <option value={name}>{name}</option>
            ))}
          </select>
          <button
            className="btn btn-success running-toggle"
            onClick={() => this._toggleRunning()}>
            {this.state.running ? (
              <span>
                Stop <span className="glyphicon glyphicon-stop" />
              </span>
            ) : (
              <span>
                Start <span className="glyphicon glyphicon-play" />
              </span>
            )}
          </button>
        </div>
        <div className="titled-table">
          {this._model ? <h4>State Array</h4> : null}
          <div ref={this._containerRef} />
          {this._model ? <h4>Output</h4> : null}
          <div ref={this._visualizerContainerRef} />
        </div>
      </div>
    );
  }

  _containerRef = (element: ?HTMLElement) => {
    this._container = element;
  };

  _visualizerContainerRef = (element: ?HTMLElement) => {
    this._visualizerContainer = element;
  };

  componentWillUnmount() {
    this._model && this._model.dispose();
    this._intervalId && clearInterval(this._intervalId);
  }

  _toggleRunning() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      delete this._intervalId;
      this.setState({running: false});
    } else {
      const oldModel = this._model;
      if (oldModel) {
        this._container && this._container.removeChild(oldModel.canvas);
        oldModel.dispose();
      }
      const model = (this._model = new Pbrrn({
        width: this.state.width,
        height: this.state.height,
        probabilityLimit: this.state.probabilityLimit,
        historyDecayRate: this.state.historyDecayRate,
      }));
      model.canvas.className = 'states';
      this._container && this._container.appendChild(model.canvas);

      const oldVisualizer = this._visualizer;
      if (oldVisualizer) {
        this._visualizerContainer &&
          this._visualizerContainer.removeChild(oldVisualizer.canvas);
      }
      const visualizer = (this._visualizer = new StateVisualizer(
        model,
        [{x: Math.floor(this.state.width / 2), y: 0}],
        64,
      ));
      visualizer.canvas.className = 'visualizer';
      this._visualizerContainer &&
        this._visualizerContainer.appendChild(visualizer.canvas);

      this._intervalId = setInterval(this._step, STEP_DELAY);
      this.setState({running: true});
    }
  }

  _step = () => {
    const model = this._model;
    if (!model) {
      return;
    }
    model.step(
      REWARD_FUNCTIONS[this.state.rewardFunction](
        false,
        model.getState(Math.floor(this.state.width / 2), 0),
      ),
    );
    this._visualizer && this._visualizer.update();
  };
}

ReactDOM.render(<PbrrnExercise />, (document.body: any));
