// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {Pbrrn} from '../models/pbrrn';

const STEP_DELAY = 10;

class PbrrnExercise extends React.Component<{}, {running: boolean}> {
  state = {running: false};

  _intervalId: ?IntervalID;
  _container: ?HTMLElement;
  _model: ?Pbrrn;

  render() {
    return (
      <div className="top">
        <div className="titled-table">
          <button
            className="btn btn-success"
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
          <h4>State</h4>
          <div ref={this._containerRef} />
        </div>
      </div>
    );
  }

  _containerRef = (element: ?HTMLElement) => {
    this._container = element;
  };

  componentWillUnmount() {
    this._model && this._model.dispose();
    this._intervalId && clearInterval(this._intervalId);
  }

  _toggleRunning() {
    if (this._intervalId) {
      const model = this._model;
      if (model) {
        this._container && this._container.removeChild(model.canvas);
        model.dispose();
      }
      this._model = null;
      clearInterval(this._intervalId);
      delete this._intervalId;
      this.setState({running: false});
    } else {
      const model = (this._model = new Pbrrn({width: 64, height: 64}));
      this._container && this._container.appendChild(model.canvas);
      this._intervalId = setInterval(this._step, STEP_DELAY);
      this.setState({running: true});
    }
  }

  _step = () => {
    const model = this._model;
    if (!model) {
      return;
    }
    model.step(0.0);
  };
}

ReactDOM.render(<PbrrnExercise />, (document.body: any));
