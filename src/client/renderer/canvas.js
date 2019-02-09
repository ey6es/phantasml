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
import {Geometry, Framebuffer, Texture, Renderer} from './util';
import {RendererComponents} from './components';
import {ComponentRenderers} from './renderers';
import {RectangleGeometry} from './helpers';
import type {PageState, ToolType, HoverState, TooltipData} from '../store';
import {DEFAULT_PAGE_SIZE, StoreActions, store} from '../store';
import type {UserGetPreferencesResponse} from '../../server/api';
import type {Resource, Entity} from '../../server/store/resource';
import {TransferableValue} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import {Scene, currentVisit} from '../../server/store/scene';
import type {Vector2, Bounds} from '../../server/store/math';
import {
  vec2,
  roundEquals,
  roundToPrecision,
  mix,
  clamp,
  boundsValid,
  boundsContain,
} from '../../server/store/math';

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

const MINIMAP_LINGER_DURATION = 3000;
const MINIMAP_FADE_DURATION = 150;
const MINIMAP_TOTAL_DURATION = MINIMAP_LINGER_DURATION + MINIMAP_FADE_DURATION;

/**
 * Renders the scene.
 */
export class RenderCanvas extends React.Component<
  {
    preferences: UserGetPreferencesResponse,
    setRenderer: (?Renderer) => void,
    fontImage: HTMLImageElement,
    setMousePositionElement: (?HTMLElement) => void,
  },
  {renderer: ?Renderer},
> {
  state = {renderer: null};

  _renderer: ?Renderer;
  _unsubscribeFromStore: ?() => void;

  _pageStateChangeTime = 0;
  _minimapBounds: ?Bounds;
  _minimapWindowBounds: ?Bounds;
  _dragging = false;

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
      <div
        key="mousePosition"
        ref={this.props.setMousePositionElement}
        className="tooltip show mouse-position">
        <div className="tooltip-inner" />
      </div>,
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
      const renderer = this._renderer;
      renderer.canvas.removeEventListener('mousedown', this._onMouseDown);
      renderer.canvas.removeEventListener('mousemove', this._onMouseMove);
      renderer.canvas.removeEventListener('mouseleave', this._onMouseUp);
      renderer.canvas.removeEventListener('mouseup', this._onMouseUp);
      renderer.dispose();
      this.props.setRenderer((this._renderer = null));
    }
    if (canvas) {
      const renderer = (this._renderer = new Renderer(
        canvas,
        this.props.fontImage,
      ));
      this.setState({renderer});
      renderer.addRenderCallback(this._renderScene);
      canvas.addEventListener('mousedown', this._onMouseDown);
      canvas.addEventListener('mousemove', this._onMouseMove);
      canvas.addEventListener('mouseleave', this._onMouseUp);
      canvas.addEventListener('mouseup', this._onMouseUp);
      this.props.setRenderer(renderer);
      this._renderMinimaps();
      renderer.requestFrameRender();
    }
  };

  _onMouseDown = (event: MouseEvent) => {
    if (!(this._minimapBounds && event.button === 0)) {
      return;
    }
    const canvas: HTMLCanvasElement = (event.target: any);
    const vx = (2.0 * event.offsetX) / canvas.clientWidth - 1.0;
    const vy = 1.0 - (2.0 * event.offsetY) / canvas.clientHeight;
    if (vx < MINIMAP_EDGE || vy < MINIMAP_EDGE) {
      return;
    }
    event.stopImmediatePropagation();
    this._dragging = true;
    canvas.style.cursor = 'all-scroll';
    this._setPagePosition(vx, vy);
  };

  _onMouseMove = (event: MouseEvent) => {
    if (!this._dragging) {
      return;
    }
    event.stopImmediatePropagation();
    const canvas: HTMLCanvasElement = (event.target: any);
    const vx = (2.0 * event.offsetX) / canvas.clientWidth - 1.0;
    const vy = 1.0 - (2.0 * event.offsetY) / canvas.clientHeight;
    this._setPagePosition(vx, vy);
  };

  _onMouseUp = (event: MouseEvent) => {
    if (this._dragging) {
      this._dragging = false;
      this._pageStateChangeTime = Date.now();
      (this._renderer: any).canvas.style.cursor = null;
    }
  };

  _setPagePosition(vx: number, vy: number) {
    const bounds = this._minimapBounds;
    const windowBounds = this._minimapWindowBounds;
    if (!(bounds && windowBounds)) {
      return;
    }
    store.dispatch(
      StoreActions.setPagePosition.create(
        mix(
          bounds.min.x,
          bounds.max.x,
          (vx - windowBounds.min.x) / (windowBounds.max.x - windowBounds.min.x),
        ),
        mix(
          bounds.min.y,
          bounds.max.y,
          (vy - windowBounds.min.y) / (windowBounds.max.y - windowBounds.min.y),
        ),
      ),
    );
  }

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
    const pixelRatio = 2.0;
    const width = Math.round(
      renderer.canvas.clientWidth * pixelRatio * MINIMAP_SIZE,
    );
    const height = Math.round(
      renderer.canvas.clientHeight * pixelRatio * MINIMAP_SIZE,
    );
    const aspect = width / height;

    const savedCamera = renderer._camera;
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
      let renderBounds: Bounds;
      const totalBounds = resource.getTotalBounds(entity.id);
      if (texture.width !== width || texture.height !== height) {
        texture.setSize(renderer, width, height);
        framebuffer.bounds = totalBounds;
        renderBounds = totalBounds;
      } else if (totalBounds !== framebuffer.bounds) {
        framebuffer.bounds = totalBounds;
        renderBounds = totalBounds;
      } else {
        renderBounds = resource.getDirtyBounds(entity.id);
        if (!renderBounds) {
          continue;
        }
      }
      renderer.bindFramebuffer(framebuffer.get(renderer));
      const background = entity.state.background || {};
      renderer.setClearColor(
        background.gridColor ||
          RendererComponents.background.properties.gridColor.defaultValue,
      );
      const gl = renderer.gl;
      if (totalBounds && boundsValid(totalBounds)) {
        const boundsWidth = totalBounds.max.x - totalBounds.min.x;
        const boundsHeight = totalBounds.max.y - totalBounds.min.y;
        const boundsAspect = boundsWidth / boundsHeight;
        if (boundsAspect > aspect) {
          const innerHeight = Math.round(width / boundsAspect);
          renderer.setViewport(
            0,
            Math.round((height - innerHeight) / 2),
            width,
            innerHeight,
          );
          const inset = MINIMAP_SIZE * (1.0 - innerHeight / height);
          framebuffer.windowBounds = {
            min: vec2(MINIMAP_EDGE, MINIMAP_EDGE + inset),
            max: vec2(1.0, 1.0 - inset),
          };
        } else {
          const innerWidth = Math.round(height * boundsAspect);
          renderer.setViewport(
            Math.round((width - innerWidth) / 2),
            0,
            innerWidth,
            height,
          );
          const inset = MINIMAP_SIZE * (1.0 - innerWidth / width);
          framebuffer.windowBounds = {
            min: vec2(MINIMAP_EDGE + inset, MINIMAP_EDGE),
            max: vec2(1.0 - inset, 1.0),
          };
        }
        renderer.setCamera(
          (totalBounds.min.x + totalBounds.max.x) / 2,
          (totalBounds.min.y + totalBounds.max.y) / 2,
          boundsHeight,
          boundsAspect,
        );
        if (!boundsContain(renderBounds, totalBounds)) {
          renderer.setEnabled(gl.SCISSOR_TEST, true);

          const sx = (renderBounds.min.x - totalBounds.min.x) / boundsWidth;
          const sy = (renderBounds.min.y - totalBounds.min.y) / boundsHeight;
          const dx = (renderBounds.max.x - totalBounds.min.x) / boundsWidth;
          const dy = (renderBounds.max.y - totalBounds.min.y) / boundsHeight;
          const vp = renderer.viewport;

          const lx = Math.floor(sx * vp.width + vp.x);
          const ly = Math.floor(sy * vp.height + vp.y);
          const ux = Math.ceil(dx * vp.width + vp.x);
          const uy = Math.ceil(dy * vp.height + vp.y);

          renderer.setScissor(lx, ly, ux - lx, uy - ly);

          cameraBounds.min.x =
            totalBounds.min.x + ((lx - vp.x) * boundsWidth) / vp.width;
          cameraBounds.min.y =
            totalBounds.min.y + ((ly - vp.y) * boundsHeight) / vp.height;
          cameraBounds.max.x =
            totalBounds.min.x + ((ux - vp.x) * boundsWidth) / vp.width;
          cameraBounds.max.y =
            totalBounds.min.y + ((uy - vp.y) * boundsHeight) / vp.height;
        } else {
          renderer.getCameraBounds(cameraBounds);
        }
        resource.applyToEntities(entity.id, cameraBounds, collectZOrdersOp);

        gl.clear(gl.COLOR_BUFFER_BIT);

        for (const entityZOrder of entityZOrders) {
          const entity = entityZOrder.entity;
          entity.getCachedValue(
            'entityRenderer',
            getEntityRenderer,
            resource.idTree,
            entity,
          )(renderer, false, false);
        }
        renderer.setEnabled(gl.SCISSOR_TEST, false);
        entityZOrders.splice(0, entityZOrders.length);
      } else {
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      renderer.bindFramebuffer(null);
    }
    renderer._camera = savedCamera;
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
    const elapsed = this._dragging ? 0 : Date.now() - this._pageStateChangeTime;
    const framebuffer =
      pageEntity && pageEntity.getLastCachedValue('framebuffer');
    if (
      elapsed >= MINIMAP_TOTAL_DURATION ||
      !framebuffer ||
      !framebuffer.bounds ||
      (boundsContain(cameraBounds, framebuffer.bounds) && !this._dragging)
    ) {
      this._minimapBounds = null;
      this._minimapWindowBounds = null;
      return;
    }
    this._minimapBounds = framebuffer.bounds;
    this._minimapWindowBounds = framebuffer.windowBounds;
    const alpha = Math.min(
      1.0,
      1.0 - (elapsed - MINIMAP_LINGER_DURATION) / MINIMAP_FADE_DURATION,
    );
    renderMinimap(renderer, framebuffer.texture.get(renderer), alpha);
    const windowBounds = framebuffer.windowBounds;
    const lx = windowBounds.min.x;
    const ly = windowBounds.min.y;
    const ux = windowBounds.max.x;
    const uy = windowBounds.max.y;
    const totalBounds = framebuffer.bounds;
    const tx = totalBounds.min.x;
    const ty = totalBounds.min.y;
    const twidth = totalBounds.max.x - tx;
    const theight = totalBounds.max.y - ty;
    const lb = MINIMAP_EDGE;
    const ub = 1.0;
    renderRectangle(
      renderer,
      vec2(
        clamp(mix(lx, ux, (cameraBounds.min.x - tx) / twidth), lb, ub),
        clamp(mix(ly, uy, (cameraBounds.min.y - ty) / theight), lb, ub),
      ),
      vec2(
        clamp(mix(lx, ux, (cameraBounds.max.x - tx) / twidth), lb, ub),
        clamp(mix(ly, uy, (cameraBounds.max.y - ty) / theight), lb, ub),
      ),
      RECTANGLE_COLOR,
      alpha,
    );
    renderer.requestFrameRender();
  };
}

const RECTANGLE_COLOR = '#375a7f';

function createFramebuffer(entity: Entity): TransferableValue<Framebuffer> {
  return new TransferableValue(new Framebuffer(new Texture()), entity => true);
}

function renderMinimap(
  renderer: Renderer,
  texture: ?WebGLTexture,
  alpha: number,
) {
  const program = renderer.getProgram(
    renderMinimap,
    renderer.getVertexShader(renderMinimap, MINIMAP_VERTEX_SHADER),
    renderer.getFragmentShader(renderMinimap, MINIMAP_FRAGMENT_SHADER),
  );
  program.setUniformInt('texture', 0);
  program.setUniformFloat('alpha', alpha);
  renderer.setEnabled(renderer.gl.BLEND, true);
  renderer.bindTexture(texture);
  MinimapGeometry.draw(program);
  renderer.bindTexture(null);
}

const MINIMAP_SIZE = 1.0 / 5.0;

const MINIMAP_EDGE = 1.0 - MINIMAP_SIZE * 2.0;

const MinimapGeometry = new Geometry(
  // prettier-ignore
  new Float32Array([
    MINIMAP_EDGE, MINIMAP_EDGE, 0, 0,
    1, MINIMAP_EDGE, 1, 0,
    1, 1, 1, 1,
    MINIMAP_EDGE, 1, 0, 1,
  ]),
  new Uint16Array([0, 1, 2, 2, 3, 0]),
  {vertex: 2, uv: 2},
);

const MINIMAP_VERTEX_SHADER = `
  attribute vec2 vertex;
  attribute vec2 uv;
  varying vec2 interpolatedUv;
  void main(void) {
    interpolatedUv = uv;
    gl_Position = vec4(vertex.xy, 0.0, 1.0);
  }
`;

const MINIMAP_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D texture;
  uniform float alpha;
  varying vec2 interpolatedUv;
  void main(void) {
    vec3 color = texture2D(texture, interpolatedUv).rgb;
    gl_FragColor = vec4(color, alpha);
  }
`;

function renderRectangle(
  renderer: Renderer,
  start: Vector2,
  end: Vector2,
  color: string,
  alpha: number,
) {
  const program = renderer.getProgram(
    renderRectangle,
    renderer.getVertexShader(renderRectangle, RECTANGLE_VERTEX_SHADER),
    renderer.getFragmentShader(renderRectangle, RECTANGLE_FRAGMENT_SHADER),
  );
  program.setUniformVector('start', start);
  program.setUniformVector('end', end);
  program.setUniformFloat('pixelSize', 2.0 / renderer.canvas.clientHeight);
  program.setUniformFloat('aspect', renderer.camera.aspect);
  program.setUniformColor('color', color);
  program.setUniformFloat('alpha', alpha);
  renderer.setEnabled(renderer.gl.BLEND, true);
  RectangleGeometry.draw(program);
}

const RECTANGLE_VERTEX_SHADER = `
  attribute vec2 vertex;
  uniform vec2 start;
  uniform vec2 end;
  varying vec2 size;
  varying vec2 modelPosition;
  void main(void) {
    size = end - start;
    modelPosition = vertex.xy;
    gl_Position = vec4(mix(start, end, vertex.xy), 0.0, 1.0);
  }
`;

const RECTANGLE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform float pixelSize;
  uniform float aspect;
  uniform vec3 color;
  uniform float alpha;
  varying vec2 size;
  varying vec2 modelPosition;
  void main(void) {
    vec2 edgeSize = (2.0 * vec2(pixelSize / aspect, pixelSize)) / size;
    vec2 edge0 = step(edgeSize, modelPosition);
    vec2 edge1 = step(modelPosition, vec2(1.0, 1.0) - edgeSize);
    gl_FragColor = vec4(
      color,
      mix(1.0, 0.0, edge0.x * edge0.y * edge1.x * edge1.y) * alpha
    );
  }
`;

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
