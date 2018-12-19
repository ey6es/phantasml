/**
 * Render canvas.
 *
 * @module client/renderer/canvas
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Tooltip} from 'reactstrap';
import {renderBackground} from './background';
import {
  MINIMAP_SIZE,
  Framebuffer,
  Texture,
  Renderer,
  renderMinimap,
} from './util';
import {ComponentRenderers} from './renderers';
import type {PageState, ToolType, HoverState, TooltipData} from '../store';
import {DEFAULT_PAGE_SIZE, store} from '../store';
import type {UserGetPreferencesResponse} from '../../server/api';
import type {Resource, Entity} from '../../server/store/resource';
import {TransferableValue} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import {Scene, currentVisit} from '../../server/store/scene';
import type {Vector2} from '../../server/store/math';
import {vec2, roundEquals, roundToPrecision} from '../../server/store/math';

const cameraBounds = {min: vec2(), max: vec2()};

/**
 * Pairs an entity with its depth order.
 */
export type EntityZOrder = {entity: Entity, zOrder: number};

const entityZOrders: EntityZOrder[] = [];

const collectZOrdersOp = (entity: Entity) => {
  const entityZOrder = entity.getCachedValue(
    'entityZOrder',
    getEntityZOrder,
    entity,
  );
  // render dragged entities on top
  const hoverState = store.getState().hoverStates.get(entity.id);
  entityZOrders.push(
    hoverState && hoverState.dragging
      ? {entity, zOrder: entityZOrder.zOrder + 1000}
      : entityZOrder,
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
 * @param idTree the id tree to use to look up entities.
 * @param entity the entity whose renderer is desired.
 * @return the render function.
 */
export function getEntityRenderer(
  idTree: IdTreeNode,
  entity: Entity,
): (Renderer, boolean, HoverState) => void {
  let renderFn: ?(Renderer, boolean, HoverState) => void;
  for (const key in entity.state) {
    const componentRenderer = ComponentRenderers[key];
    if (componentRenderer) {
      const currentRenderFn = componentRenderer.createRenderFn(idTree, entity);
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
  {
    preferences: UserGetPreferencesResponse,
    setRenderer: (?Renderer) => void,
    fontImage: HTMLImageElement,
  },
  {renderer: ?Renderer},
> {
  state = {renderer: null};

  _renderer: ?Renderer;
  _unsubscribeFromStore: ?() => void;

  _pageStateChangeTime = 0;

  render() {
    return [
      <canvas
        key="canvas"
        id="render-canvas"
        ref={this._setCanvas}
        className="render-canvas"
      />,
      this.props.preferences.showStats ? (
        <CanvasStats key="stats" renderer={this.state.renderer} />
      ) : null,
      <CanvasTooltips key="tooltips" renderer={this.state.renderer} />,
    ];
  }

  componentDidMount() {
    window.addEventListener('resize', this._onResize);

    const state = store.getState();
    let lastResource = state.resource;
    let lastPage = state.page;
    let lastPageState = state.pageStates.get(state.page);
    let lastSelection = state.selection;
    let lastHoverStates = state.hoverStates;
    let lastTool = state.tool;
    let lastTempTool = state.tempTool;
    this._unsubscribeFromStore = store.subscribe(() => {
      const state = store.getState();
      const resourceChanged = state.resource !== lastResource;
      const pageState = state.pageStates.get(state.page);
      const pageStateChanged = pageState !== lastPageState;
      if (
        resourceChanged ||
        state.page !== lastPage ||
        pageStateChanged ||
        state.selection !== lastSelection ||
        state.hoverStates !== lastHoverStates ||
        state.tool !== lastTool ||
        state.tempTool !== lastTempTool
      ) {
        lastResource = state.resource;
        lastPage = state.page;
        lastPageState = pageState;
        lastSelection = state.selection;
        lastHoverStates = state.hoverStates;
        lastTool = state.tool;
        lastTempTool = state.tempTool;
        resourceChanged && this._renderMinimaps();
        this._renderer && this._renderer.requestFrameRender();
        if (pageStateChanged) {
          this._pageStateChangeTime = Date.now();
        }
      }
    });
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
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
      this.setState({renderer});
      renderer.addRenderCallback(this._renderScene);
      this.props.setRenderer(renderer);
      this._renderMinimaps();
      renderer.requestFrameRender();
    }
  };

  _onResize = () => {
    this._renderMinimaps();
    this._renderer && this._renderer.requestFrameRender();
  };

  _renderMinimaps() {
    const state = store.getState();
    const resource = state.resource;
    const renderer = this._renderer;
    if (!(resource instanceof Scene && renderer)) {
      return;
    }
    const pixelRatio = window.devicePixelRatio || 1.0;
    const width = Math.round(
      renderer.canvas.clientWidth * pixelRatio * MINIMAP_SIZE,
    );
    const height = Math.round(
      renderer.canvas.clientHeight * pixelRatio * MINIMAP_SIZE,
    );
    for (const node of resource.entityHierarchy.children) {
      const entity = node.id && resource.getEntity(node.id);
      if (!entity) {
        continue;
      }
      const framebuffer = entity.getCachedValue(
        'framebuffer',
        createFramebuffer,
        entity,
      );
      const texture = framebuffer.texture;
      if (texture.width !== width || texture.height !== height) {
        texture.setSize(renderer, width, height);
      }
      renderer.bindFramebuffer(framebuffer.get(renderer));
      const gl = renderer.gl;
      gl.clearColor(0.5, 0.5, 0.5, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.bindFramebuffer(null);
    }
  }

  _renderScene = (renderer: Renderer) => {
    // make sure canvas/viewport dimensions match layout ones
    const pixelRatio = window.devicePixelRatio || 1.0;
    const width = Math.round(renderer.canvas.clientWidth * pixelRatio);
    const height = Math.round(renderer.canvas.clientHeight * pixelRatio);
    if (renderer.canvas.width !== width || renderer.canvas.height !== height) {
      renderer.setCanvasSize(width, height);
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

    // add anything in the hover states that wasn't already added
    for (const id of state.hoverStates.keys()) {
      const entity = resource.getEntity(id);
      if (entity && entity.visit !== currentVisit) {
        entity.visit = currentVisit;
        collectZOrdersOp(entity);
      }
    }

    // sort by increasing z-order
    entityZOrders.sort(compareEntityZOrders);

    // render in sorted order
    const overrideHoverState =
      (state.tempTool || state.tool) === 'erase' ? 'erase' : false;
    for (const entityZOrder of entityZOrders) {
      const entity = entityZOrder.entity;
      const hoverState = state.hoverStates.get(entity.id);
      entity.getCachedValue(
        'entityRenderer',
        getEntityRenderer,
        resource.idTree,
        entity,
      )(
        renderer,
        state.selection.has(entity.id),
        hoverState ? overrideHoverState || hoverState : false,
      );
    }

    // clear for next time
    entityZOrders.splice(0, entityZOrders.length);

    // perhaps render the minimap
    const MINIMAP_LINGER_DURATION = 1000;
    const MINIMAP_FADE_DURATION = 150;
    const elapsed = Date.now() - this._pageStateChangeTime;
    const framebuffer =
      pageEntity && pageEntity.getLastCachedValue('framebuffer');
    if (
      elapsed >= MINIMAP_LINGER_DURATION + MINIMAP_FADE_DURATION ||
      !framebuffer
    ) {
      return;
    }
    const alpha = Math.min(
      1.0,
      1.0 - (elapsed - MINIMAP_LINGER_DURATION) / MINIMAP_FADE_DURATION,
    );
    renderMinimap(renderer, framebuffer.texture.get(renderer), alpha);
    renderer.requestFrameRender();
  };
}

function createFramebuffer(entity: Entity): TransferableValue<Framebuffer> {
  return new TransferableValue(new Framebuffer(new Texture()), entity => true);
}

class CanvasStats extends React.Component<
  {renderer: ?Renderer},
  {
    framesPerSecond: number,
    arrayBuffers: number,
    elementArrayBuffers: number,
    vertexShaders: number,
    fragmentShaders: number,
    programs: number,
    textures: number,
    framebuffers: number,
  },
> {
  state = {
    framesPerSecond: 0,
    arrayBuffers: 0,
    elementArrayBuffers: 0,
    vertexShaders: 0,
    fragmentShaders: 0,
    programs: 0,
    textures: 0,
    framebuffers: 0,
  };

  _updateIntervalID: IntervalID;

  render() {
    return (
      <div className="canvas-stats">
        <div>
          <FormattedMessage
            id="stats.frames_per_second"
            defaultMessage="FPS: {value}"
            values={{value: Math.round(this.state.framesPerSecond)}}
          />
        </div>
        <div>
          <FormattedMessage
            id="stats.array_buffers"
            defaultMessage="Array Buffers: {value}"
            values={{value: this.state.arrayBuffers}}
          />
        </div>
        <div>
          <FormattedMessage
            id="stats.element_array_buffers"
            defaultMessage="Element Array Buffers: {value}"
            values={{value: this.state.elementArrayBuffers}}
          />
        </div>
        <div>
          <FormattedMessage
            id="stats.vertex_shaders"
            defaultMessage="Vertex Shaders: {value}"
            values={{value: this.state.vertexShaders}}
          />
        </div>
        <div>
          <FormattedMessage
            id="stats.fragment_shaders"
            defaultMessage="Fragment Shaders: {value}"
            values={{value: this.state.fragmentShaders}}
          />
        </div>
        <div>
          <FormattedMessage
            id="stats.programs"
            defaultMessage="Programs: {value}"
            values={{value: this.state.programs}}
          />
        </div>
        <div>
          <FormattedMessage
            id="stats.textures"
            defaultMessage="Textures: {value}"
            values={{value: this.state.textures}}
          />
        </div>
        <div>
          <FormattedMessage
            id="stats.framebuffers"
            defaultMessage="Framebuffers: {value}"
            values={{value: this.state.framebuffers}}
          />
        </div>
      </div>
    );
  }

  componentDidMount() {
    this._updateState();
    this._updateIntervalID = setInterval(this._updateState, 1000);
  }

  componentWillUnmount() {
    clearInterval(this._updateIntervalID);
  }

  _updateState = () => {
    const renderer = this.props.renderer;
    if (!renderer) {
      return;
    }
    this.setState({
      framesPerSecond: renderer.framesPerSecond,
      arrayBuffers: renderer.arrayBuffers.size,
      elementArrayBuffers: renderer.elementArrayBuffers.size,
      vertexShaders: renderer.vertexShaders.size,
      fragmentShaders: renderer.fragmentShaders.size,
      programs: renderer.programs.size,
      textures: renderer.textures.size,
      framebuffers: renderer.framebuffers.size,
    });
  };
}

const CanvasTooltips = ReactRedux.connect(state => ({
  tooltip: state.tooltip,
}))((props: {renderer: ?Renderer, tooltip: ?TooltipData}) => {
  const tooltip = props.tooltip;
  const renderer = props.renderer;
  if (!(tooltip && renderer)) {
    return null;
  }
  return [
    <CanvasTooltip
      key="primary"
      renderer={renderer}
      label={tooltip.label}
      position={tooltip.position}
    />,
    tooltip.secondaryLabel && tooltip.secondaryPosition ? (
      <CanvasTooltip
        key="secondary"
        renderer={renderer}
        label={tooltip.secondaryLabel}
        position={tooltip.secondaryPosition}
      />
    ) : null,
  ];
});

function CanvasTooltip(props: {
  renderer: Renderer,
  label: React.Element<any>,
  position: Vector2,
}) {
  const offset = roundEquals(props.renderer.getCanvasPosition(props.position));
  offset.x -= props.renderer.canvas.clientWidth / 2;
  return (
    <Tooltip
      isOpen={true}
      target="render-canvas"
      placement="top"
      arrowClassName="canvas-tooltip-arrow"
      modifiers={{
        flip: {enabled: false},
        keepTogether: {enabled: false},
        arrow: {enabled: false},
        offset: {offset: `${offset.x}, ${-offset.y}`},
      }}>
      {props.label}
    </Tooltip>
  );
}
