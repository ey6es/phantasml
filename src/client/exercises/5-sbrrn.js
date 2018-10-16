// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {AbstractSbrrnExercise} from './shared';
import type {AbstractSbrrn} from '../models/sbrrn';
import {Sbrrn} from '../models/sbrrn';

class SbrrnExercise extends AbstractSbrrnExercise {
  _renderCustomControls() {
    return (
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
    );
  }

  _createModel(): AbstractSbrrn {
    return new Sbrrn(
      {
        width: this.state.width,
        height: this.state.height,
        probabilityLimit: this.state.probabilityLimit,
        historyDecayRate: this.state.historyDecayRate,
        disableSelfInputs: !this.state.includeSelfInputs,
      },
      this._modelCanvas,
    );
  }
}

ReactDOM.render(<SbrrnExercise />, (document.body: any));
