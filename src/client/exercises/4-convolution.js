// @flow

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as tf from '@tensorflow/tfjs';

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
    patternA: [],
    patternB: [],
    trained: false,
    testPattern: [],
  };

  render() {
    return <div className="top" />;
  }
}

ReactDOM.render(<ConvolutionExercise />, (document.body: any));
