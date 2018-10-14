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
import {ComponentRenderers} from './renderers';
import {DEFAULT_PAGE_SIZE} from '../store';
import type {PageState, ToolType} from '../store';
import type {Resource, Entity} from '../../server/store/resource';
import {Scene} from '../../server/store/scene';
import {vec2} from '../../server/store/math';

const cameraBounds = {min: vec2(), max: vec2()};

type EntityZOrder = {entity: Entity, zOrder: number};
const entityZOrders: EntityZOrder[] = [];

const collectZOrdersOp = (entity: Entity) => {
  entityZOrders.push(entity.getCachedValue('entityZOrder', getEntityZOrder));
};

function getEntityZOrder(entity: Entity): EntityZOrder {
  let zOrder = 0;
  for (const key in entity.state) {
    const renderer = ComponentRenderers[key];
    if (renderer) {
      zOrder = renderer.getZOrder(entity.state[key]);
      break;
    }
  }
  return {entity, zOrder};
}

function compareEntityZOrders(a: EntityZOrder, b: EntityZOrder): number {
  return a.zOrder - b.zOrder;
}

function getEntityRenderer(entity: Entity): Renderer => void {
  let renderFn: ?(Renderer) => void;
  for (const key in entity.state) {
    const componentRenderer = ComponentRenderers[key];
    if (componentRenderer) {
      const currentRenderFn = componentRenderer.createRenderFn(
        entity.state[key],
        entity,
      );
      if (renderFn) {
        const previousRenderFn = renderFn;
        renderFn = (renderer: Renderer) => {
          previousRenderFn(renderer);
          currentRenderFn(renderer);
        };
      } else {
        renderFn = currentRenderFn;
      }
    }
  }
  return renderFn || (() => {});
}

class RenderCanvasImpl extends React.Component<
  {
    resource: ?Resource,
    page: string,
    pageState: ?PageState,
    selection: Set<string>,
    tool: ToolType,
    setRenderer: (?Renderer) => void,
  },
  {},
> {
  _renderer: ?Renderer;

  render() {
    return <canvas ref={this._setCanvas} className="render-canvas" />;
  }

  componentDidMount() {
    window.addEventListener('resize', this._renderFrame);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._renderFrame);
  }

  componentDidUpdate() {
    this._renderFrame();
  }

  _setCanvas = (canvas: ?HTMLCanvasElement) => {
    if (this._renderer) {
      this._renderer.dispose();
      this.props.setRenderer((this._renderer = null));
    }
    if (canvas) {
      const renderer = (this._renderer = new Renderer(canvas));
      renderer.addRenderCallback(this._renderScene);
      this.props.setRenderer(renderer);
    }
  };

  _renderFrame = () => {
    this._renderer && this._renderer.renderFrame();
  };

  _renderScene = (renderer: Renderer) => {
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

    // traverse scene to find renderable entities in frame (and z orders)
    renderer.getCameraBounds(cameraBounds);
    resource.quadtree.applyToEntities(cameraBounds, collectZOrdersOp);

    // sort by increasing z-order
    entityZOrders.sort(compareEntityZOrders);

    // render in sorted order
    for (const entityZOrder of entityZOrders) {
      const entity = entityZOrder.entity;
      entity.getCachedValue('entityRenderer', getEntityRenderer)(renderer);
    }

    // clear for next time
    entityZOrders.splice(0, entityZOrders.length);
  };
}

/**
 * Renders the scene.
 */
export const RenderCanvas = ReactRedux.connect(state => ({
  resource: state.resource,
  page: state.page,
  pageState: state.pageStates.get(state.page),
  selection: state.selection,
  tool: state.tool,
}))(RenderCanvasImpl);
