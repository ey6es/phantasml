// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {Psa} from '../models/psa';

const STEP_DELAY = 10;

class PsaExercise extends React.Component<{}, {running: boolean}> {
  state = {running: false};

  _intervalId: ?IntervalID;
  _container: ?HTMLElement;
  _psa: ?Psa;

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
    this._psa && this._psa.dispose();
    this._intervalId && clearInterval(this._intervalId);
  }

  _toggleRunning() {
    if (this._intervalId) {
      const psa = this._psa;
      if (psa) {
        this._container && this._container.removeChild(psa.canvas);
        psa.dispose();
      }
      this._psa = null;
      clearInterval(this._intervalId);
      delete this._intervalId;
      this.setState({running: false});
    } else {
      const psa = (this._psa = new Psa(64, 64));
      this._container && this._container.appendChild(psa.canvas);
      this._intervalId = setInterval(this._step, STEP_DELAY);
      this.setState({running: true});
    }
  }

  _step = () => {
    const psa = this._psa;
    if (!psa) {
      return;
    }
    psa.step(0.0);
  };
}

ReactDOM.render(<PsaExercise />, (document.body: any));
