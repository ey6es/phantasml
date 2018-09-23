/**
 * Render canvas.
 *
 * @module client/renderer/canvas
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import type {Resource} from '../../server/store/resource';

class RenderCanvasImpl extends React.Component<
  {resource: ?Resource, page: string},
  {},
> {
  _canvas: ?HTMLCanvasElement;
  _gl: ?WebGLRenderingContext;

  render() {
    return <canvas ref={this._setCanvas} className="render-canvas" />;
  }

  componentDidMount() {
    window.addEventListener('resize', this._renderScene);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._renderScene);
  }

  componentDidUpdate() {
    this._renderScene();
  }

  _setCanvas = (canvas: ?HTMLCanvasElement) => {
    this._canvas = canvas;
    if (canvas) {
      this._gl = canvas.getContext('webgl', {alpha: false, depth: false});
    } else {
      this._gl = null;
    }
  };

  _renderScene = () => {
    const canvas = this._canvas;
    if (!canvas) {
      return;
    }
    // make sure canvas dimensions match layout ones
    if (
      canvas.clientWidth !== canvas.width ||
      canvas.clientHeight !== canvas.height
    ) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
  };
}

/**
 * Renders the scene.
 */
export const RenderCanvas = ReactRedux.connect(state => ({
  resource: state.resource,
  page: state.page,
}))(RenderCanvasImpl);
