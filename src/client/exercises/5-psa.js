// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {Psa} from '../models/psa';

class PsaExercise extends React.Component<{}, {extensions: string}> {
  state = {extensions: ''};

  _psa: Psa;

  render() {
    return <div className="top">{this.state.extensions}</div>;
  }

  componentDidMount() {
    this._psa = new Psa(512, 512);
    let extensions = this._psa._gl.getSupportedExtensions() || [];
    this.setState({extensions: extensions.join(', ')});
  }

  componentWillUnmount() {
    this._psa.dispose();
  }
}

ReactDOM.render(<PsaExercise />, (document.body: any));
