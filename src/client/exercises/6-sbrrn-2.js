// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {AbstractSbrrnExercise} from './shared';
import type {AbstractSbrrn} from '../models/sbrrn';
import {Sbrrn2} from '../models/sbrrn';

class Sbrrn2Exercise extends AbstractSbrrnExercise {
  _createModel(): AbstractSbrrn {
    return new Sbrrn2(
      {
        width: this.state.width,
        height: this.state.height,
        probabilityLimit: this.state.probabilityLimit,
        disableSelfInputs: !this.state.includeSelfInputs,
      },
      this._modelCanvas,
    );
  }
}

ReactDOM.render(<Sbrrn2Exercise />, (document.body: any));
