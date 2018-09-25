/**
 * Render canvas.
 *
 * @module client/renderer/canvas
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {renderBackground} from './background';
import {Renderer} from './util';
import {DEFAULT_PAGE_SIZE} from '../store';
import type {PageState} from '../store';
import type {Resource} from '../../server/store/resource';
import {Scene} from '../../server/store/scene';

class RenderCanvasImpl extends React.Component<
  {resource: ?Resource, page: string, pageState: ?PageState},
  {},
> {
  _renderer: ?Renderer;

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
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }
    if (canvas) {
      this._renderer = new Renderer(canvas);
    }
  };

  _renderScene = () => {
    const renderer = this._renderer;
    if (!renderer) {
      return;
    }
    // make sure canvas/viewport dimensions match layout ones
    if (
      renderer.canvas.clientWidth !== renderer.canvas.width ||
      renderer.canvas.clientHeight !== renderer.canvas.height
    ) {
      renderer.canvas.width = renderer.canvas.clientWidth;
      renderer.canvas.height = renderer.canvas.clientHeight;
    }
    renderer.setViewport(0, 0, renderer.canvas.width, renderer.canvas.height);
    const resource = this.props.resource;
    if (!(resource instanceof Scene)) {
      return;
    }
    // set camera properties from page state
    const pageState = this.props.pageState || {};
    renderer.setCamera(
      pageState.x || 0,
      pageState.y || 0,
      pageState.size || DEFAULT_PAGE_SIZE,
      renderer.canvas.width / renderer.canvas.height,
    );

    // render background
    const pageEntity = resource.getEntity(this.props.page);
    pageEntity && renderBackground(renderer, pageEntity.state.background);
  };
}

/**
 * Renders the scene.
 */
export const RenderCanvas = ReactRedux.connect(state => ({
  resource: state.resource,
  page: state.page,
  pageState: state.pageStates.get(state.page),
}))(RenderCanvasImpl);
