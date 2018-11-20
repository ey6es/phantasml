/**
 * Render canvas.
 *
 * @module client/renderer/canvas
 * @flow
 */

import * as React from 'react';
import {renderBackground} from './background';
import {Renderer} from './util';
import type {HoverState} from './renderers';
import {ComponentRenderers} from './renderers';
import type {PageState, ToolType} from '../store';
import {DEFAULT_PAGE_SIZE, store} from '../store';
import type {Resource, Entity} from '../../server/store/resource';
import {Scene} from '../../server/store/scene';
import {vec2} from '../../server/store/math';

const cameraBounds = {min: vec2(), max: vec2()};

/**
 * Pairs an entity with its depth order.
 */
export type EntityZOrder = {entity: Entity, zOrder: number};

const entityZOrders: EntityZOrder[] = [];

const collectZOrdersOp = (entity: Entity) => {
  entityZOrders.push(
    entity.getCachedValue('entityZOrder', getEntityZOrder, entity),
  );
};

/**
 * Creates the z order pairing for an entity.
 *
 * @param entity the entity of interest.
 * @return the z order pairing.
 */
export function getEntityZOrder(entity: Entity): EntityZOrder {
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

/**
 * Compare function for entity z order pairs.
 *
 * @param a the first z order to compare.
 * @param b the second z order to compare.
 * @return a negative, zero, or positive number if less, equal, or greater,
 * respectively.
 */
export function compareEntityZOrders(a: EntityZOrder, b: EntityZOrder): number {
  return a.zOrder - b.zOrder;
}

/**
 * Creates the renderer for an entity.
 *
 * @param entity the entity whose renderer is desired.
 * @return the render function.
 */
export function getEntityRenderer(
  entity: Entity,
): (Renderer, boolean, HoverState) => void {
  let renderFn: ?(Renderer, boolean, HoverState) => void;
  for (const key in entity.state) {
    const componentRenderer = ComponentRenderers[key];
    if (componentRenderer) {
      const currentRenderFn = componentRenderer.createRenderFn(
        entity.state[key],
        entity,
      );
      if (renderFn) {
        const previousRenderFn = renderFn;
        renderFn = (renderer, selected, hoverState) => {
          previousRenderFn(renderer, selected, hoverState);
          currentRenderFn(renderer, selected, hoverState);
        };
      } else {
        renderFn = currentRenderFn;
      }
    }
  }
  return renderFn || (() => {});
}

/**
 * Renders the scene.
 */
export class RenderCanvas extends React.Component<
  {setRenderer: (?Renderer) => void, fontImage: HTMLImageElement},
  {},
> {
  _renderer: ?Renderer;
  _unsubscribeFromStore: ?() => void;

  render() {
    return <canvas ref={this._setCanvas} className="render-canvas" />;
  }

  componentDidMount() {
    window.addEventListener('resize', this._renderFrame);

    const state = store.getState();
    let lastResource = state.resource;
    let lastPage = state.page;
    let lastPageState = state.pageStates.get(state.page);
    let lastSelection = state.selection;
    let lastHover = state.hover;
    let lastTool = state.tool;
    let lastTempTool = state.tempTool;
    this._unsubscribeFromStore = store.subscribe(() => {
      const state = store.getState();
      const pageState = state.pageStates.get(state.page);
      if (
        state.resource !== lastResource ||
        state.page !== lastPage ||
        pageState !== lastPageState ||
        state.selection !== lastSelection ||
        state.hover !== lastHover ||
        state.tool !== lastTool ||
        state.tempTool !== lastTempTool
      ) {
        lastResource = state.resource;
        lastPage = state.page;
        lastPageState = pageState;
        lastSelection = state.selection;
        lastHover = state.hover;
        lastTool = state.tool;
        lastTempTool = state.tempTool;
        this._renderer && this._renderer.requestFrameRender();
      }
    });
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._renderFrame);
    this._unsubscribeFromStore && this._unsubscribeFromStore();
  }

  _setCanvas = (canvas: ?HTMLCanvasElement) => {
    if (this._renderer) {
      this._renderer.dispose();
      this.props.setRenderer((this._renderer = null));
    }
    if (canvas) {
      const renderer = (this._renderer = new Renderer(
        canvas,
        this.props.fontImage,
      ));
      renderer.addRenderCallback(this._renderScene);
      this.props.setRenderer(renderer);
      renderer.renderFrame();
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
    const state = store.getState();
    const resource = state.resource;
    if (!(resource instanceof Scene)) {
      return;
    }
    // set camera properties from page state
    const pageState = state.pageStates.get(state.page) || {};
    renderer.setCamera(
      pageState.x || 0,
      pageState.y || 0,
      pageState.size || DEFAULT_PAGE_SIZE,
      width / height,
    );

    // render background
    const pageEntity = resource.getEntity(state.page);
    pageEntity && renderBackground(renderer, pageEntity.state.background);

    // traverse scene to find renderable entities in frame (and z orders)
    renderer.getCameraBounds(cameraBounds);
    resource.applyToEntities(state.page, cameraBounds, collectZOrdersOp);

    // sort by increasing z-order
    entityZOrders.sort(compareEntityZOrders);

    // render in sorted order
    const hoverState =
      (state.tempTool || state.tool) === 'erase' ? 'erase' : true;
    for (const entityZOrder of entityZOrders) {
      const entity = entityZOrder.entity;
      entity.getCachedValue('entityRenderer', getEntityRenderer, entity)(
        renderer,
        state.selection.has(entity.id),
        state.hover.has(entity.id) ? hoverState : false,
      );
    }

    // clear for next time
    entityZOrders.splice(0, entityZOrders.length);
  };
}
