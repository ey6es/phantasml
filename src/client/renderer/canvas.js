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
  {
    resource: ?Resource,
    page: string,
    pageState: ?PageState,
    setRenderer: (?Renderer) => void,
  },
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
      this.props.setRenderer((this._renderer = null));
    }
    if (canvas) {
      this.props.setRenderer((this._renderer = new Renderer(canvas)));
    }
  };

  _renderScene = () => {
    const renderer = this._renderer;
    if (!renderer) {
      return;
    }
    // make sure canvas/viewport dimensions match layout ones
    const pixelRatio = window.devicePixelRatio || 1.0;
    const width = Math.round(renderer.canvas.clientWidth * pixelRatio);
    const height = Math.round(renderer.canvas.clientHeight * pixelRatio);
    if (renderer.canvas.width !== width || renderer.canvas.height !== height) {
      renderer.canvas.width = width;
      renderer.canvas.height = height;
    }
    renderer.setViewport(0, 0, width, height);
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
      width / height,
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
