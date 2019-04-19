/**
 * Components related to tools.
 *
 * @module client/tool
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {
  Nav,
  Button,
  ButtonGroup,
  Container,
  FormGroup,
  UncontrolledTooltip,
} from 'reactstrap';
import {library} from '@fortawesome/fontawesome-svg-core';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faPlay} from '@fortawesome/free-solid-svg-icons/faPlay';
import {faPause} from '@fortawesome/free-solid-svg-icons/faPause';
import {faStop} from '@fortawesome/free-solid-svg-icons/faStop';
import {faFastBackward} from '@fortawesome/free-solid-svg-icons/faFastBackward';
import {faFastForward} from '@fortawesome/free-solid-svg-icons/faFastForward';
import {faMousePointer} from '@fortawesome/free-solid-svg-icons/faMousePointer';
import {faExpand} from '@fortawesome/free-solid-svg-icons/faExpand';
import {faMagic} from '@fortawesome/free-solid-svg-icons/faMagic';
import {faArrowsAlt} from '@fortawesome/free-solid-svg-icons/faArrowsAlt';
import {faSyncAlt} from '@fortawesome/free-solid-svg-icons/faSyncAlt';
import {faCompress} from '@fortawesome/free-solid-svg-icons/faCompress';
import {faEraser} from '@fortawesome/free-solid-svg-icons/faEraser';
import {faDotCircle} from '@fortawesome/free-solid-svg-icons/faDotCircle';
import {faPencilAlt} from '@fortawesome/free-solid-svg-icons/faPencilAlt';
import {faDrawPolygon} from '@fortawesome/free-solid-svg-icons/faDrawPolygon';
import {faCircleNotch} from '@fortawesome/free-solid-svg-icons/faCircleNotch';
import {faBezierCurve} from '@fortawesome/free-solid-svg-icons/faBezierCurve';
import {faProjectDiagram} from '@fortawesome/free-solid-svg-icons/faProjectDiagram';
import {faVectorSquare} from '@fortawesome/free-solid-svg-icons/faVectorSquare';
import {faStamp} from '@fortawesome/free-solid-svg-icons/faStamp';
import type {ToolType, HoverState} from './store';
import {
  StoreActions,
  store,
  centerPageOnSelection,
  createPasteAction,
} from './store';
import type {PropertyData} from './component';
import {PropertyEditorGroup} from './component';
import {createEntity} from './entity';
import {zoomPage} from './view';
import type {EntityZOrder} from './renderer/canvas';
import {
  getEntityZOrder,
  compareEntityZOrders,
  getEntityRenderer,
} from './renderer/canvas';
import type {Renderer} from './renderer/util';
import {Geometry} from './renderer/util';
import type {HoverType} from './renderer/helpers';
import {
  renderRectangle,
  renderAxes,
  renderTranslationHandle,
  renderRotationHandle,
  renderScaleHandle,
  renderPointHelper,
  renderLineHelper,
  renderPolygonHelper,
  renderRectangleHelper,
  renderArcHelper,
  renderCurveHelper,
} from './renderer/helpers';
import {
  PathColorProperty,
  FillColorProperty,
  RendererComponents,
} from './renderer/components';
import {
  SELECT_COLOR,
  ERASE_COLOR,
  ComponentRenderers,
} from './renderer/renderers';
import {
  ThicknessProperty,
  FillProperty,
  LoopProperty,
  GeometryComponents,
} from './geometry/components';
import {DynamicProperty} from './physics/components';
import {TOOLTIP_DELAY, Shortcut, ShortcutHandler} from './util/ui';
import type {UserGetPreferencesResponse} from '../server/api';
import type {Resource, Entity} from '../server/store/resource';
import {Scene, SceneActions} from '../server/store/scene';
import type {Vector2, LineSegment, Transform} from '../server/store/math';
import {
  invertTransform,
  simplifyTransform,
  composeTransforms,
  getTransformTranslation,
  getTransformRotation,
  getTransformScale,
  getTransformMatrix,
  getTransformInverseMatrix,
  vec2,
  equals,
  plus,
  plusEquals,
  times,
  timesEquals,
  minus,
  minusEquals,
  normalizeEquals,
  round,
  roundEquals,
  rotate,
  rotateEquals,
  orthogonalize,
  dot,
  cross,
  length,
  transformPoint,
  transformPointEquals,
  transformPoints,
  min,
  max,
  distance,
  boundsContain,
  getBoundsVertices,
  expandBounds,
  expandBoundsEquals,
  clamp,
  getMean,
  getCentroid,
  getSignedArea,
} from '../server/store/math';
import type {ControlPoint} from '../server/store/geometry';
import {
  DEFAULT_THICKNESS,
  getCollisionGeometry,
  ComponentGeometry,
} from '../server/store/geometry';
import {ShapeList, Shape, Path} from '../server/store/shape';
import {getValue, mapsEqual} from '../server/store/util';

library.add(faPlay);
library.add(faPause);
library.add(faStop);
library.add(faFastBackward);
library.add(faFastForward);
library.add(faMousePointer);
library.add(faExpand);
library.add(faMagic);
library.add(faArrowsAlt);
library.add(faSyncAlt);
library.add(faCompress);
library.add(faEraser);
library.add(faDotCircle);
library.add(faPencilAlt);
library.add(faDrawPolygon);
library.add(faCircleNotch);
library.add(faBezierCurve);
library.add(faProjectDiagram);
library.add(faVectorSquare);
library.add(faStamp);

type OptionProperties = {[string]: PropertyData};

/**
 * The set of tools available.
 */
export class Toolset extends React.Component<
  {
    locale: string,
    preferences: UserGetPreferencesResponse,
    setPreferences: UserGetPreferencesResponse => void,
    renderer: ?Renderer,
    entityMenuPosition: ?Vector2,
    openEntityMenu: Vector2 => void,
    mousePositionElement: ?HTMLElement,
  },
  {optionProperties: ?OptionProperties},
> {
  state = {optionProperties: null};

  render() {
    const toolProps = {
      locale: this.props.locale,
      renderer: this.props.renderer,
      entityMenuPosition: this.props.entityMenuPosition,
      openEntityMenu: this.props.openEntityMenu,
      mousePositionElement: this.props.mousePositionElement,
      options: this.props.preferences,
      setOptionProperties: this._setOptionProperties,
    };
    return (
      <div>
        <Nav
          tabs
          className="pt-2 bg-black play-controls justify-content-center">
          <ButtonGroup>
            <PlayButton />
            <PauseButton />
            <StopButton />
            <BackButton />
            <ForwardButton />
          </ButtonGroup>
        </Nav>
        <div className="border-bottom border-secondary pt-3">
          <div className="tool-grid">
            <ButtonGroup className="text-center">
              <SelectPanTool {...toolProps} />
              <RectSelectTool {...toolProps} />
              <TranslateTool {...toolProps} />
              <RotateTool {...toolProps} />
              <ScaleTool {...toolProps} />
            </ButtonGroup>
            <ButtonGroup className="text-center">
              <ContiguousSelectTool {...toolProps} />
              <EraseTool {...toolProps} />
              <PointTool {...toolProps} />
              <LineTool {...toolProps} />
              <LineGroupTool {...toolProps} />
            </ButtonGroup>
            <ButtonGroup className="text-center">
              <PolygonTool {...toolProps} />
              <RectangleTool {...toolProps} />
              <ArcTool {...toolProps} />
              <CurveTool {...toolProps} />
              <StampTool {...toolProps} />
            </ButtonGroup>
          </div>
          {this.state.optionProperties ? (
            <Container className="mt-1">
              <PropertyEditorGroup
                type="options"
                properties={this.state.optionProperties}
                labelSize={6}
                padding={false}
                rightAlign={true}
                values={this.props.preferences}
                setValue={(key, value) =>
                  this.props.setPreferences(
                    Object.assign({}, this.props.preferences, {[key]: value}),
                  )
                }
                preferences={this.props.preferences}
                setPreferences={this.props.setPreferences}
              />
            </Container>
          ) : null}
        </div>
      </div>
    );
  }

  _setOptionProperties = (optionProperties: ?OptionProperties) => {
    this.setState({optionProperties});
  };
}

const PlayButton = ReactRedux.connect(state => ({
  disabled: state.playState !== 'stopped',
}))(props => (
  <PlayControl
    icon="play"
    name={<FormattedMessage id="play" defaultMessage="Play" />}
    charOrCode="Y"
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.play.create())}
  />
));

const PauseButton = ReactRedux.connect(state => ({
  disabled: state.playState === 'stopped',
  resume: state.playState === 'paused',
}))(props => (
  <PlayControl
    icon="pause"
    name={
      props.resume ? (
        <FormattedMessage id="resume" defaultMessage="Resume" />
      ) : (
        <FormattedMessage id="pause" defaultMessage="Pause" />
      )
    }
    charOrCode="U"
    disabled={props.disabled}
    indicator={props.resume}
    onClick={() => {
      if (props.resume) {
        store.dispatch(StoreActions.resume.create());
      } else {
        store.dispatch(StoreActions.pause.create());
      }
    }}
  />
));

const StopButton = ReactRedux.connect(state => ({
  disabled: state.playState === 'stopped',
}))(props => (
  <PlayControl
    icon="stop"
    name={<FormattedMessage id="stop" defaultMessage="Stop" />}
    charOrCode="I"
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.stop.create())}
  />
));

const BackButton = ReactRedux.connect(state => ({
  disabled: state.playState === 'stopped',
}))(props => (
  <PlayControl
    icon="fast-backward"
    name={<FormattedMessage id="back" defaultMessage="Back" />}
    charOrCode="O"
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.back.create())}
  />
));

const ForwardButton = ReactRedux.connect(state => ({
  disabled: state.snapshotIndex >= state.snapshots.length - 1,
}))(props => (
  <PlayControl
    icon="fast-forward"
    name={<FormattedMessage id="forward" defaultMessage="Forward" />}
    charOrCode="P"
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.forward.create())}
  />
));

function PlayControl(props: {
  icon: string,
  name: React.Element<any>,
  charOrCode: string | number,
  disabled: boolean,
  indicator?: boolean,
  onClick: () => void,
}) {
  const shortcut = new Shortcut(props.charOrCode);
  return [
    <Button
      key="button"
      className="position-relative"
      id={props.icon}
      color="link"
      disabled={props.disabled}
      onClick={props.onClick}>
      <FontAwesomeIcon icon={props.icon} />
      {props.indicator ? <div className="play-indicator" /> : null}
    </Button>,
    <ShortcutTooltip
      key="tooltip"
      target={props.icon}
      name={props.name}
      shortcut={shortcut}
    />,
    <ShortcutHandler
      key="shortcut"
      shortcut={shortcut}
      disabled={props.disabled}
      onPress={props.onClick}
    />,
  ];
}

function ShortcutTooltip(props: {
  target: string,
  name: React.Element<any>,
  shortcut: Shortcut,
}) {
  return (
    <UncontrolledTooltip
      delay={{show: TOOLTIP_DELAY, hide: 0}}
      target={props.target}>
      <FormattedMessage
        id="tool.tip"
        defaultMessage="{name} ({shortcut})"
        values={{
          name: props.name,
          shortcut: props.shortcut.render(),
        }}
      />
    </UncontrolledTooltip>
  );
}

type ToolProps = {
  locale: string,
  renderer: ?Renderer,
  entityMenuPosition: ?Vector2,
  openEntityMenu: Vector2 => void,
  mousePositionElement: ?HTMLElement,
  options: UserGetPreferencesResponse,
  setOptionProperties: (?OptionProperties) => void,
  activeTool: ToolType,
  tempTool: ?ToolType,
  selection: Set<string>,
  hoverStates: Map<string, HoverState>,
  page: string,
};

function connectTool(toolImpl: Function) {
  return ReactRedux.connect(state => ({
    activeTool: state.tool,
    tempTool: state.tempTool,
    selection: state.selection,
    hoverStates: state.hoverStates,
    page: state.page,
  }))(toolImpl);
}

class ToolImpl extends React.Component<ToolProps, {}> {
  _type: ToolType;
  _icon: string;
  _name: React.Element<any>;
  _tempActivateShortcut: Shortcut;
  _activateShortcut: Shortcut;
  _optionProperties: OptionProperties;

  /** Checks whether the tool is active. */
  get active(): boolean {
    return (
      (this.tempActive || (!this.props.tempTool && this.permActive)) &&
      !this.props.entityMenuPosition
    );
  }

  /** Checks whether the tool is temporarily active. */
  get tempActive(): boolean {
    return this.props.tempTool === this._type;
  }

  /** Checks whether the tool is "permanently" active. */
  get permActive(): boolean {
    return this.props.activeTool === this._type;
  }

  /** Checks whether the tool allows snapping to features. */
  get allowFeatureSnap(): boolean {
    return true;
  }

  constructor(
    type: ToolType,
    icon: string,
    name: React.Element<any>,
    charOrCode: string | number,
    optionProperties: OptionProperties,
    ...args: any[]
  ) {
    super(...args);
    this._type = type;
    this._icon = icon;
    this._name = name;
    this._tempActivateShortcut = new Shortcut(charOrCode);
    this._activateShortcut = new Shortcut(charOrCode, Shortcut.SHIFT);
    this._optionProperties = optionProperties;
  }

  render() {
    return [
      <Button
        key="button"
        id={this._type}
        color="primary"
        active={this.permActive}
        className={this.tempActive ? 'temp-active' : undefined}
        onClick={this._activate}>
        <FontAwesomeIcon icon={this._icon} />
      </Button>,
      <ShortcutTooltip
        key="tooltip"
        target={this._type}
        name={this._name}
        shortcut={this._tempActivateShortcut}
      />,
    ];
  }

  _activate = () => {
    store.dispatch(StoreActions.setTool.create(this._type));
  };

  componentDidMount() {
    this.props.renderer && this._subscribeToRenderer(this.props.renderer);
  }

  componentWillUnmount() {
    this.props.renderer && this._unsubscribeFromRenderer(this.props.renderer);
  }

  componentDidUpdate(prevProps: ToolProps, prevState: Object) {
    const renderer = this.props.renderer;
    if (prevProps.renderer !== renderer) {
      prevProps.renderer && this._unsubscribeFromRenderer(prevProps.renderer);
      renderer && this._subscribeToRenderer(renderer);
    } else if (renderer) {
      const wasActive =
        prevProps.tempTool === this._type ||
        (!prevProps.tempTool && prevProps.activeTool === this._type);
      if (wasActive !== this.active) {
        wasActive ? this._onDeactivate(renderer) : this._onActivate(renderer);
      }
    }
  }

  _subscribeToRenderer(renderer: Renderer) {
    renderer.addRenderCallback(this._renderHelpers);
    renderer.canvas.addEventListener('mouseenter', this._onMouseEnter);
    renderer.canvas.addEventListener('mouseleave', this._onMouseLeave);
    renderer.canvas.addEventListener('mousedown', this._onMouseDown);
    renderer.canvas.addEventListener('contextmenu', this._onContextMenu);
    renderer.canvas.addEventListener('dblclick', this._onDoubleClick);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    renderer.canvas.addEventListener('wheel', this._onWheel, {passive: true});
    this.active && this._onActivate(renderer);
  }

  _unsubscribeFromRenderer(renderer: Renderer) {
    renderer.removeRenderCallback(this._renderHelpers);
    renderer.canvas.removeEventListener('mouseenter', this._onMouseEnter);
    renderer.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    renderer.canvas.removeEventListener('mousedown', this._onMouseDown);
    renderer.canvas.removeEventListener('contextmenu', this._onContextMenu);
    renderer.canvas.removeEventListener('dblclick', this._onDoubleClick);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    renderer.canvas.removeEventListener('wheel', this._onWheel);
    this.active && this._onDeactivate(renderer);
  }

  _onActivate(renderer: Renderer) {
    this.props.setOptionProperties(this._optionProperties);
    renderer.requestFrameRender();
  }

  _onDeactivate(renderer: Renderer) {
    // nothing by default
  }

  _renderHelpers = (renderer: Renderer) => {
    // nothing by default
  };

  _getSelectionTransform(renderer: Renderer, withScale?: boolean): Transform {
    const resource = store.getState().resource;
    if (!(resource instanceof Scene && this.props.selection.size > 0)) {
      return null;
    }
    const translation = vec2();
    let rotation: ?number;
    const pixelsToWorldUnits = renderer.pixelsToWorldUnits;
    let scale = vec2(pixelsToWorldUnits, pixelsToWorldUnits);
    let translationCount = 0;
    for (const id of this.props.selection) {
      // if we have children and their parents, we only want the parents
      if (resource.isAncestorInSet(id, this.props.selection)) {
        continue;
      }
      const transform = resource.getWorldTransform(id);
      plusEquals(translation, getTransformTranslation(transform));
      translationCount++;
      if (rotation == null) {
        rotation = getTransformRotation(transform);
        withScale && equals(getTransformScale(transform), scale);
      }
    }
    timesEquals(translation, 1.0 / translationCount);
    return {translation, rotation, scale};
  }

  _onMouseEnter = (event: MouseEvent) => {
    const mousePositionElement = this.props.mousePositionElement;
    if (this.active && mousePositionElement) {
      mousePositionElement.style.visibility = 'visible';
    }
  };

  _onMouseLeave = (event: MouseEvent) => {
    const mousePositionElement = this.props.mousePositionElement;
    if (this.active && mousePositionElement) {
      mousePositionElement.style.visibility = 'hidden';
    }
  };

  _onMouseDown = (event: MouseEvent) => {
    // nothing by default
  };

  _onContextMenu = (event: MouseEvent) => {
    if (this.active) {
      event.preventDefault();
      this.props.openEntityMenu(vec2(event.clientX, event.clientY));
    }
  };

  _onDoubleClick = (event: MouseEvent) => {
    // nothing by default
  };

  _onMouseUp = (event: MouseEvent) => {
    // nothing by default
  };

  _onMouseMove = (event: MouseEvent) => {
    // nothing by default
  };

  _onKeyDown = (event: KeyboardEvent) => {
    if (this._activateShortcut.matches(event)) {
      this._activate();
    } else if (this._tempActivateShortcut.matches(event)) {
      store.dispatch(StoreActions.setTempTool.create(this._type));
    }
  };

  _onKeyUp = (event: KeyboardEvent) => {
    if (
      this.props.tempTool === this._type &&
      this._tempActivateShortcut.matches(event)
    ) {
      store.dispatch(StoreActions.setTempTool.create(null));
    }
  };

  _onWheel = (event: WheelEvent) => {
    // nothing by default
  };

  _displayMousePosition(position: Vector2) {
    const child =
      this.props.mousePositionElement &&
      this.props.mousePositionElement.firstChild;
    if (child) {
      child.textContent = `X: ${position.x.toFixed(2)}, Y: ${position.y.toFixed(
        2,
      )}`;
    }
  }

  _updatePointHover(clientX: number, clientY: number) {
    if (!this.active) {
      return;
    }
    const renderer = this.props.renderer;
    const resource = store.getState().resource;
    if (!(renderer && resource instanceof Scene)) {
      return;
    }
    const position = renderer.getEventPosition(clientX, clientY);
    this._displayMousePosition(position);
    const localPosition = vec2();
    const hoverStates: Map<string, HoverState> = new Map();
    const bounds = {min: position, max: position};
    if (boundsContain(renderer.getCameraBounds(), bounds)) {
      resource.applyToEntities(this.props.page, bounds, entity => {
        const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
        if (
          collisionGeometry &&
          collisionGeometry.intersectsPoint(
            transformPoint(
              position,
              getTransformInverseMatrix(
                entity.getLastCachedValue('worldTransform'),
              ),
              localPosition,
            ),
          ) &&
          this._allowHover(entity)
        ) {
          hoverStates.set(entity.id, true);
        }
      });
    }
    (document.body: any).style.cursor = hoverStates.size > 0 ? 'pointer' : null;
    if (!mapsEqual(hoverStates, this.props.hoverStates)) {
      store.dispatch(StoreActions.setHoverStates.create(hoverStates));
    }
  }

  _updateRectHover(rect: ?LineSegment) {
    const resource = store.getState().resource;
    if (!(rect && resource instanceof Scene)) {
      return;
    }
    const bounds = {
      min: min(rect.start, rect.end),
      max: max(rect.start, rect.end),
    };
    const vertices = getBoundsVertices(bounds);
    const localVertices = [];
    const hoverStates: Map<string, HoverState> = new Map();
    resource.applyToEntities(this.props.page, bounds, entity => {
      const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
      if (!collisionGeometry) {
        return;
      }
      transformPoints(
        vertices,
        getTransformInverseMatrix(entity.getLastCachedValue('worldTransform')),
        localVertices,
      );
      if (
        collisionGeometry &&
        collisionGeometry.intersectsPolygon(localVertices) &&
        this._allowHover(entity)
      ) {
        hoverStates.set(entity.id, true);
      }
    });
    if (!mapsEqual(hoverStates, this.props.hoverStates)) {
      store.dispatch(StoreActions.setHoverStates.create(hoverStates));
    }
  }

  _allowHover(entity: Entity): boolean {
    return true;
  }

  _getMousePosition(
    renderer: Renderer,
    clientX: number,
    clientY: number,
    matchFeatureEntity: ?(Entity) => boolean,
  ): Vector2 {
    const position = renderer.getEventPosition(clientX, clientY);
    const snapped = equals(position);
    this.props.options.gridSnap && roundToGridEquals(snapped);
    if (!(this.props.options.featureSnap && this.allowFeatureSnap)) {
      return snapped;
    }
    const resource = store.getState().resource;
    if (!(resource instanceof Scene)) {
      return snapped;
    }
    const nearestPosition = vec2();
    let nearestDistance = Infinity;
    resource.applyToEntities(
      this.props.page,
      expandBoundsEquals({min: equals(position), max: equals(position)}, 1.0),
      entity => {
        const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
        if (
          !collisionGeometry ||
          (matchFeatureEntity && !matchFeatureEntity(entity))
        ) {
          return;
        }
        const worldTransform = entity.getLastCachedValue('worldTransform');
        const localPosition = transformPoint(
          position,
          getTransformInverseMatrix(worldTransform),
        );
        const featurePosition = collisionGeometry.getNearestFeaturePosition(
          localPosition,
          0.5,
        );
        if (featurePosition) {
          transformPointEquals(
            featurePosition,
            getTransformMatrix(worldTransform),
          );
          const dist = distance(featurePosition, position);
          if (dist < nearestDistance) {
            equals(featurePosition, nearestPosition);
            nearestDistance = dist;
          }
        }
      },
    );
    if (
      nearestDistance < Infinity &&
      (!this.props.options.gridSnap ||
        nearestDistance < distance(position, snapped))
    ) {
      return nearestPosition;
    }
    return snapped;
  }
}

function GridSnapLabel() {
  return <FormattedMessage id="tool.grid_snap" defaultMessage="Grid Snap:" />;
}

function FeatureSnapLabel() {
  return (
    <FormattedMessage id="tool.feature_snap" defaultMessage="Feature Snap:" />
  );
}

class SelectPanToolImpl extends ToolImpl {
  _lastClientX = -1;
  _lastClientY = -1;
  _panning = false;
  _pressed = false;
  _updatingHoverStates = false;
  _dragging = false;
  _unsubscribeFromStore: ?() => void;

  constructor(...args: any[]) {
    super(
      'selectPan',
      'mouse-pointer',
      <FormattedMessage
        id="tool.select_pan"
        defaultMessage="Select/Grab/Pan"
      />,
      'Q',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }

  _onActivate(renderer: Renderer) {
    this._updatePointHover(this._lastClientX, this._lastClientY);
    this.props.setOptionProperties(this._optionProperties);
    renderer.requestFrameRender();

    const state = store.getState();
    let lastResource = state.resource;
    let lastPage = state.page;
    let lastPageState = state.pageStates.get(state.page);
    this._unsubscribeFromStore = store.subscribe(() => {
      const state = store.getState();
      const pageState = state.pageStates.get(state.page);
      if (
        state.resource !== lastResource ||
        state.page !== lastPage ||
        pageState !== lastPageState
      ) {
        lastResource = state.resource;
        lastPage = state.page;
        lastPageState = pageState;
        this._dragging || this._handleMoveOrScroll();
      }
    });
  }

  _onDeactivate(renderer: Renderer) {
    this._unsubscribeFromStore && this._unsubscribeFromStore();
    this._updatePointHover(this._lastClientX, this._lastClientY);
  }

  _renderHelpers = (renderer: Renderer) => {
    const activeTool = this.props.tempTool || this.props.activeTool;
    if (
      activeTool === 'translate' ||
      activeTool === 'rotate' ||
      activeTool === 'scale'
    ) {
      return; // transform tools have their own axes
    }
    const transform = this._getSelectionTransform(renderer);
    transform && renderAxes(renderer, transform);
  };

  _onMouseDown = (event: MouseEvent) => {
    if (!this.active) {
      return;
    }
    if (event.button === 0) {
      this._pressed = true;
    }
    const renderer = this.props.renderer;
    const state = store.getState();
    const resource = state.resource;
    if (!(renderer && resource)) {
      return;
    }
    const eventPosition = renderer.getEventPosition(
      this._lastClientX,
      this._lastClientY,
    );
    const localPosition = vec2();
    if (this.props.hoverStates.size > 0) {
      const map = {};
      let hoverStates = this.props.hoverStates;
      for (const [id, hoverState] of this.props.hoverStates) {
        let select = true;
        if (event.button === 0) {
          const entity = resource.getEntity(id);
          if (entity) {
            for (const key in entity.state) {
              const renderer = ComponentRenderers[key];
              if (renderer) {
                const [newHoverState, newSelect] = renderer.onPress(
                  entity,
                  transformPoint(
                    eventPosition,
                    getTransformInverseMatrix(
                      entity.getLastCachedValue('worldTransform'),
                    ),
                    localPosition,
                  ),
                );
                if (newHoverState !== hoverState) {
                  if (hoverStates === this.props.hoverStates) {
                    hoverStates = new Map(this.props.hoverStates);
                  }
                  hoverStates.set(id, newHoverState);
                }
                select = newSelect;
                break;
              }
            }
          }
        }
        if (select) {
          if (event.ctrlKey) {
            map[id] = !this.props.selection.has(id);
          } else if (state.selection.has(id)) {
            // if we select something that was already selected, include
            // the entire existing selection
            for (const id of state.selection) {
              map[id] = true;
            }
          } else {
            map[id] = true;
          }
        }
      }
      if (hoverStates !== this.props.hoverStates) {
        store.dispatch(StoreActions.setHoverStates.create(hoverStates));
      }
      store.dispatch(StoreActions.select.create(map, event.ctrlKey));
    } else {
      if (this.props.selection.size > 0) {
        store.dispatch(StoreActions.select.create({}));
      }
      if (event.button === 0) {
        this._panning = true;
      }
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) {
      this._pressed = false;
    }
    if (this._panning) {
      (document.body: any).style.cursor = null;
      this._panning = false;
    }
    if (this.props.hoverStates.size > 0) {
      const renderer = this.props.renderer;
      const resource = store.getState().resource;
      if (!(renderer && resource)) {
        return;
      }
      const eventPosition = renderer.getEventPosition(
        this._lastClientX,
        this._lastClientY,
      );
      const localPosition = vec2();
      let hoverStates = this.props.hoverStates;
      let hovered = false;
      for (const [id, hoverState] of this.props.hoverStates) {
        const entity = resource.getEntity(id);
        if (entity) {
          for (const key in entity.state) {
            const renderer = ComponentRenderers[key];
            if (renderer) {
              const newHoverState = renderer.onRelease(
                entity,
                transformPoint(
                  eventPosition,
                  getTransformInverseMatrix(
                    entity.getLastCachedValue('worldTransform'),
                  ),
                  localPosition,
                ),
              );
              if (newHoverState) {
                hovered = true;
              }
              if (newHoverState !== hoverState) {
                if (hoverStates === this.props.hoverStates) {
                  hoverStates = new Map(this.props.hoverStates);
                }
                hoverStates.set(id, newHoverState);
              }
              break;
            }
          }
        }
      }
      if (hoverStates !== this.props.hoverStates) {
        store.dispatch(StoreActions.setHoverStates.create(hoverStates));
      }
      (document.body: any).style.cursor = hovered ? 'pointer' : null;
    }
    this._updatePointHover(this._lastClientX, this._lastClientY);
  };

  _onMouseMove = (event: MouseEvent) => {
    this._lastClientX = event.clientX;
    this._lastClientY = event.clientY;

    if (this._panning) {
      const renderer = this.props.renderer;
      if (!renderer) {
        return;
      }
      const camera = renderer.camera;
      const pixelsToWorldUnits = renderer.pixelsToWorldUnits;
      store.dispatch(
        StoreActions.setPagePosition.create(
          camera.x - event.movementX * pixelsToWorldUnits,
          camera.y + event.movementY * pixelsToWorldUnits,
        ),
      );
      (document.body: any).style.cursor = 'all-scroll';
    } else {
      this._handleMoveOrScroll();
    }
  };

  _handleMoveOrScroll() {
    if (this._panning) {
      return;
    }
    if (this._pressed) {
      const renderer = this.props.renderer;
      const resource = store.getState().resource;
      if (!(renderer && resource instanceof Scene)) {
        return;
      }
      const eventPosition = this._getMousePosition(
        renderer,
        this._lastClientX,
        this._lastClientY,
        entity => {
          const hoverState = this.props.hoverStates.get(entity.id);
          return !(hoverState && hoverState.dragging);
        },
      );
      this._displayMousePosition(eventPosition);
      const localPosition = vec2();
      let hoverStates = this.props.hoverStates;
      let dragging = false;
      const setHoverState = (id: string, hoverState: HoverState) => {
        if (hoverStates.get(id) !== hoverState) {
          if (hoverStates === this.props.hoverStates) {
            hoverStates = new Map(this.props.hoverStates);
          }
          if (hoverState === undefined) {
            hoverStates.delete(id);
          } else {
            hoverStates.set(id, hoverState);
          }
        }
        if (hoverState && hoverState.dragging) {
          dragging = true;
        }
      };
      for (const [id, hoverState] of this.props.hoverStates) {
        if (hoverState && hoverState.over) {
          continue; // dragged-over, not dragged
        }
        const entity = resource.getEntity(id);
        if (entity) {
          for (const key in entity.state) {
            const renderer = ComponentRenderers[key];
            if (renderer) {
              this._dragging = true;
              try {
                setHoverState(
                  id,
                  renderer.onDrag(
                    entity,
                    transformPoint(
                      eventPosition,
                      getTransformInverseMatrix(
                        entity.getLastCachedValue('worldTransform'),
                      ),
                      localPosition,
                    ),
                    setHoverState,
                  ),
                );
              } finally {
                this._dragging = false;
              }
              break;
            }
          }
        }
      }
      if (hoverStates !== this.props.hoverStates) {
        store.dispatch(StoreActions.setHoverStates.create(hoverStates));
      }
      if (dragging) {
        (document.body: any).style.cursor = 'all-scroll';
      }
    } else {
      this._updatePointHover(this._lastClientX, this._lastClientY);
    }
  }

  _onWheel = (event: WheelEvent) => {
    zoomPage(event.deltaY > 0 ? 1 : -1);
  };

  _updatePointHover(clientX: number, clientY: number) {
    if (!this.active) {
      return;
    }
    const renderer = this.props.renderer;
    const resource = store.getState().resource;
    if (!(renderer && resource instanceof Scene)) {
      return;
    }
    if (!this._pressed) {
      const hoverStates: Map<string, HoverState> = new Map();
      const position = renderer.getEventPosition(clientX, clientY);
      this._displayMousePosition(position);
      const bounds = {min: position, max: position};
      if (boundsContain(renderer.getCameraBounds(), bounds)) {
        const entityZOrders: EntityZOrder[] = [];
        resource.applyToEntities(this.props.page, bounds, entity => {
          entityZOrders.push(
            entity.getCachedValue('entityZOrder', getEntityZOrder, entity),
          );
        });
        entityZOrders.sort(compareEntityZOrders);
        const localPosition = vec2();
        entityLoop: for (let ii = entityZOrders.length - 1; ii >= 0; ii--) {
          const entity = entityZOrders[ii].entity;
          for (const key in entity.state) {
            const renderer = ComponentRenderers[key];
            if (renderer) {
              const hoverState = renderer.onMove(
                entity,
                transformPoint(
                  position,
                  getTransformInverseMatrix(
                    entity.getLastCachedValue('worldTransform'),
                  ),
                  localPosition,
                ),
              );
              if (hoverState) {
                hoverStates.set(entity.id, hoverState);
                break entityLoop;
              }
              break;
            }
          }
        }
      }
      (document.body: any).style.cursor =
        hoverStates.size > 0 ? 'pointer' : null;
      if (!mapsEqual(hoverStates, this.props.hoverStates)) {
        store.dispatch(StoreActions.setHoverStates.create(hoverStates));
        this._maybeRequestHoverStateUpdate();
      }
    }
    renderer.requestFrameRender();
  }

  _maybeRequestHoverStateUpdate() {
    if (store.getState().hoverStates.size > 0 && !this._updatingHoverStates) {
      requestAnimationFrame(this._updateHoverStates);
      this._updatingHoverStates = true;
    }
  }

  _updateHoverStates = () => {
    this._updatingHoverStates = false;
    const state = store.getState();
    const resource = state.resource;
    if (!(this.active && resource instanceof Scene)) {
      return;
    }
    let hoverStates = state.hoverStates;
    for (const [id, hoverState] of state.hoverStates) {
      const entity = resource.getEntity(id);
      if (!entity) {
        continue;
      }
      for (const key in entity.state) {
        const renderer = ComponentRenderers[key];
        if (renderer) {
          const newHoverState = renderer.onFrame(entity);
          if (newHoverState !== hoverState) {
            if (hoverStates === state.hoverStates) {
              hoverStates = new Map(state.hoverStates);
            }
            hoverStates.set(id, newHoverState);
          }
          break;
        }
      }
    }
    if (hoverStates !== state.hoverStates) {
      store.dispatch(StoreActions.setHoverStates.create(hoverStates));
    }
    this._maybeRequestHoverStateUpdate();
  };
}
const SelectPanTool = connectTool(SelectPanToolImpl);

function getMousePosition(
  renderer: Renderer,
  gridSnap: ?boolean,
  event: MouseEvent,
): Vector2 {
  const position = renderer.getEventPosition(event.clientX, event.clientY);
  gridSnap && roundToGridEquals(position);
  return position;
}

function roundToGridEquals(position: Vector2): Vector2 {
  const state = store.getState();
  const resource = state.resource;
  if (!(resource instanceof Scene)) {
    return position;
  }
  const entity = resource.getEntity(state.page);
  if (!entity) {
    return position;
  }
  const background = entity.state.background || {};
  const gridScale =
    background.gridScale ||
    RendererComponents.background.properties.gridScale.defaultValue;
  return timesEquals(
    roundEquals(timesEquals(position, 1.0 / gridScale)),
    gridScale,
  );
}

class HoverToolImpl extends ToolImpl {
  _lastClientX = -1;
  _lastClientY = -1;
  _rect: ?LineSegment;

  get allowFeatureSnap(): boolean {
    return false;
  }

  get _rectColor(): string {
    return SELECT_COLOR;
  }

  componentDidUpdate(prevProps: ToolProps, prevState: Object) {
    super.componentDidUpdate(prevProps, prevState);
    if (this._rect) {
      this._updateRectHover(this._rect);
    } else {
      this._updatePointHover(this._lastClientX, this._lastClientY);
    }
  }

  _renderHelpers = (renderer: Renderer) => {
    this._rect && renderRectangle(renderer, this._rect, this._rectColor);
  };

  _onMouseDown = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    if (this.active && event.button === 0 && renderer) {
      if (this.props.hoverStates.size === 0) {
        const position = this._getMousePosition(
          renderer,
          event.clientX,
          event.clientY,
        );
        this._displayMousePosition(position);
        this._rect = {start: position, end: position};
        this._updateRectHover(this._rect);
        renderer.canvas.style.cursor = 'crosshair';
      } else {
        this._processHovered(event.ctrlKey);
      }
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    if (this._rect && renderer) {
      this._rect = null;
      renderer.requestFrameRender();
      this._processHovered(event.ctrlKey);
      renderer.canvas.style.cursor = 'inherit';
    }
  };

  _processHovered(additive: boolean) {
    throw new Error('Not implemented.');
  }

  _onMouseMove = (event: MouseEvent) => {
    this._lastClientX = event.clientX;
    this._lastClientY = event.clientY;

    const renderer = this.props.renderer;
    if (renderer && this._rect) {
      const position = this._getMousePosition(
        renderer,
        event.clientX,
        event.clientY,
      );
      this._displayMousePosition(position);
      this._rect = Object.assign({}, this._rect, {end: position});
      this._updateRectHover(this._rect);
      renderer.requestFrameRender();
    } else {
      this._updatePointHover(this._lastClientX, this._lastClientY);
    }
  };
}

class RectSelectToolImpl extends HoverToolImpl {
  constructor(...args: any[]) {
    super(
      'rectSelect',
      'expand',
      <FormattedMessage id="tool.rect_select" defaultMessage="Rect Select" />,
      'W',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
      },
      ...args,
    );
  }

  _processHovered(additive: boolean) {
    const map: {[string]: boolean} = {};
    for (const id of this.props.hoverStates.keys()) {
      map[id] = additive ? !this.props.selection.has(id) : true;
    }
    store.dispatch(StoreActions.select.create(map, additive));
    store.dispatch(StoreActions.setHoverStates.create(new Map()));
  }
}
const RectSelectTool = connectTool(RectSelectToolImpl);

class HandleToolImpl extends ToolImpl {
  _relativePosition = vec2();
  _position: ?Vector2;
  _rotation = 0.0;
  _scale: ?Vector2;
  _hover: HoverType = 'xy';
  _pressed = false;

  get _local(): boolean {
    return !!this.props.options.local;
  }

  componentDidUpdate(prevProps: ToolProps, prevState: Object) {
    super.componentDidUpdate(prevProps, prevState);
    this.props.renderer && this.props.renderer.requestFrameRender();
  }

  _renderHelpers = (renderer: Renderer) => {
    this._position = null;
    if (!this.active) {
      return;
    }
    const selectionTransform = this._getSelectionTransform(renderer, true);
    if (!selectionTransform) {
      return;
    }
    if (!this._local) {
      selectionTransform.rotation = 0.0;
    }
    this._position = getTransformTranslation(selectionTransform);
    this._rotation = getTransformRotation(selectionTransform);
    this._scale = getTransformScale(selectionTransform);
    const pixelsToWorldUnits = renderer.pixelsToWorldUnits;
    selectionTransform.scale = vec2(pixelsToWorldUnits, pixelsToWorldUnits);
    this._renderHandle(renderer, selectionTransform);
  };

  _renderHandle(renderer: Renderer, transform: Transform) {
    throw new Error('Not implemented.');
  }

  _onMouseMove = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    const position = this._position;
    if (!(renderer && position)) {
      this._hover = 'xy';
      if (this.active && renderer) {
        this._displayMousePosition(
          renderer.getEventPosition(event.clientX, event.clientY),
        );
      }
      return;
    }
    if (this._pressed) {
      const resource = store.getState().resource;
      if (!(resource instanceof Scene)) {
        return;
      }
      const oldPosition = position;
      const newPosition = minusEquals(
        getMousePosition(renderer, false, event),
        this._relativePosition,
      );
      const dragTransform = this._getDragTransform(
        renderer,
        oldPosition,
        newPosition,
      );
      if (!dragTransform) {
        return;
      }
      const map = {};
      for (const id of this.props.selection) {
        if (resource.isAncestorInSet(id, this.props.selection)) {
          continue;
        }
        const entity = resource.getEntity(id);
        if (!entity) {
          continue;
        }
        const oldWorldTransform = resource.getWorldTransform(id);
        const transform = simplifyTransform(
          composeTransforms(
            composeTransforms(
              entity.state.transform,
              invertTransform(oldWorldTransform),
            ),
            composeTransforms(dragTransform, oldWorldTransform),
          ),
        );
        map[id] = {transform};
      }
      store.dispatch(SceneActions.editEntities.create(map));
    } else {
      const eventPosition = renderer.getEventPosition(
        event.clientX,
        event.clientY,
      );
      this._displayMousePosition(eventPosition);
      const vector = minusEquals(eventPosition, position);
      let hover: HoverType = 'xy';
      const outerRadius = renderer.pixelsToWorldUnits * 40.0;
      const len = length(vector);
      if (len < outerRadius) {
        const innerRadius = renderer.pixelsToWorldUnits * 15.0;
        if (len > innerRadius) {
          rotateEquals(vector, -this._rotation);
          if (vector.x > vector.y === vector.x < -vector.y) {
            hover = 'y';
          } else {
            hover = 'x';
          }
        }
      }
      if (this._hover !== hover) {
        this._hover = hover;
        renderer.requestFrameRender();
      }
    }
  };

  _onMouseDown = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    const position = this._position;
    if (this.active && event.button === 0 && renderer && position) {
      this._pressed = true;
      minus(
        getMousePosition(renderer, false, event),
        position,
        this._relativePosition,
      );
      renderer.requestFrameRender();
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    if (this._pressed && renderer) {
      this._pressed = false;
      this._displayMousePosition(
        renderer.getEventPosition(event.clientX, event.clientY),
      );
      renderer.requestFrameRender();
    }
  };

  _getDragTransform(
    renderer: Renderer,
    oldPosition: Vector2,
    newPosition: Vector2,
  ): Transform {
    throw new Error('Not implemented.');
  }
}

function LocalAxesLabel() {
  return <FormattedMessage id="tool.local_axes" defaultMessage="Local Axes:" />;
}

class TranslateToolImpl extends HandleToolImpl {
  constructor(...args: any[]) {
    super(
      'translate',
      'arrows-alt',
      <FormattedMessage id="tool.translate" defaultMessage="Translate" />,
      'E',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        local: {type: 'boolean', label: <LocalAxesLabel />},
      },
      ...args,
    );
  }

  _renderHandle(renderer: Renderer, transform: Transform) {
    renderTranslationHandle(renderer, transform, this._hover, this._pressed);
  }

  _getDragTransform(
    renderer: Renderer,
    oldPosition: Vector2,
    newPosition: Vector2,
  ): Transform {
    this.props.options.gridSnap && roundToGridEquals(newPosition);
    const translation = minus(newPosition, oldPosition);
    if (this._hover !== 'xy') {
      const axis = this._hover === 'x' ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      rotateEquals(axis, this._rotation);
      times(axis, dot(axis, translation), translation);
      if (this.props.options.gridSnap) {
        roundToGridEquals(plus(oldPosition, translation, newPosition));
        minus(newPosition, oldPosition, translation);
        if (this.props.options.local) {
          const len = length(translation);
          if (len > 0) {
            const dp = dot(axis, translation) / len;
            if (dp > -0.999 && dp < 0.999) {
              return null;
            }
          }
        }
      }
    }
    this._displayMousePosition(newPosition);
    return length(translation) < 0.001 ? null : {translation};
  }
}
const TranslateTool = connectTool(TranslateToolImpl);

class RotateToolImpl extends HandleToolImpl {
  get _local(): boolean {
    return true;
  }

  constructor(...args: any[]) {
    super(
      'rotate',
      'sync-alt',
      <FormattedMessage id="tool.rotate" defaultMessage="Rotate" />,
      'R',
      {
        snap: {
          type: 'boolean',
          label: (
            <FormattedMessage
              id="tool.rotate.snap"
              defaultMessage="22.5&deg; Snap:"
            />
          ),
        },
      },
      ...args,
    );
  }

  _renderHandle(renderer: Renderer, transform: Transform) {
    renderRotationHandle(
      renderer,
      transform,
      this._hover && 'xy',
      this._pressed,
    );
  }

  _getDragTransform(
    renderer: Renderer,
    oldPosition: Vector2,
    newPosition: Vector2,
  ): Transform {
    const handlePosition = this._position;
    if (!handlePosition) {
      return null;
    }
    const newWorldPosition = plus(newPosition, this._relativePosition);
    this._displayMousePosition(newWorldPosition);
    const sourceRotation = this._rotation;
    const from = normalizeEquals(
      minusEquals(plus(oldPosition, this._relativePosition), handlePosition),
    );
    const to = normalizeEquals(minusEquals(newWorldPosition, handlePosition));
    let destRotation = sourceRotation + Math.asin(cross(from, to));
    if (this.props.options.snap) {
      destRotation = (Math.round((8 * destRotation) / Math.PI) * Math.PI) / 8;
    }
    const rotation = destRotation - sourceRotation;
    if (Math.abs(rotation) < 0.001) {
      return null;
    }
    rotateEquals(this._relativePosition, rotation);
    const translation = minus(handlePosition, rotate(handlePosition, rotation));
    return {translation, rotation};
  }
}
const RotateTool = connectTool(RotateToolImpl);

function roundScale(scale: number): number {
  return Math.abs(scale) < 1.0
    ? 1.0 / Math.round(1.0 / scale)
    : Math.round(scale);
}

class ScaleToolImpl extends HandleToolImpl {
  get _local(): boolean {
    return this.props.options.local !== false;
  }

  constructor(...args: any[]) {
    super(
      'scale',
      'compress',
      <FormattedMessage id="tool.scale" defaultMessage="Scale" />,
      'T',
      {
        snap: {
          type: 'boolean',
          label: (
            <FormattedMessage
              id="tool.scale.snap"
              defaultMessage="Integer Snap:"
            />
          ),
        },
        local: {
          type: 'boolean',
          label: <LocalAxesLabel />,
          defaultValue: true,
        },
      },
      ...args,
    );
  }

  _renderHandle(renderer: Renderer, transform: Transform) {
    renderScaleHandle(renderer, transform, this._hover, this._pressed);
  }

  _getDragTransform(
    renderer: Renderer,
    oldPosition: Vector2,
    newPosition: Vector2,
  ): Transform {
    const handlePosition = this._position;
    const worldScale = this._scale;
    if (!(handlePosition && worldScale)) {
      return null;
    }
    const newWorldPosition = plus(newPosition, this._relativePosition);
    this._displayMousePosition(newWorldPosition);
    const from = rotate(worldScale, this._rotation);
    const to = minusEquals(newWorldPosition, handlePosition);
    to.x /= this._relativePosition.x;
    to.y /= this._relativePosition.y;
    const axisX = rotateEquals(vec2(1.0, 0.0), this._rotation);
    const axisY = orthogonalize(axisX);
    const scale = vec2(1.0, 1.0);
    if (this._hover !== 'y') {
      const fromScale = dot(from, axisX);
      let toScale = dot(to, axisX);
      if (this.props.options.snap) {
        toScale = roundScale(toScale);
      }
      if (fromScale !== 0.0 && toScale !== 0.0) {
        scale.x = toScale / fromScale;
      }
    }
    if (this._hover !== 'x') {
      const fromScale = dot(from, axisY);
      let toScale = dot(to, axisY);
      if (this.props.options.snap) {
        toScale = roundScale(toScale);
      }
      if (fromScale !== 0.0 && toScale !== 0.0) {
        scale.y = toScale / fromScale;
      }
    }
    if (Math.abs(scale.x - 1.0) < 0.001 && Math.abs(scale.y - 1.0) < 0.001) {
      return null;
    }
    return composeTransforms(
      {translation: handlePosition, rotation: this._rotation, scale},
      invertTransform({translation: handlePosition, rotation: this._rotation}),
    );
  }
}
const ScaleTool = connectTool(ScaleToolImpl);

class ContiguousSelectToolImpl extends HoverToolImpl {
  constructor(...args: any[]) {
    super(
      'contiguousSelect',
      'magic',
      <FormattedMessage
        id="tool.contiguous_select"
        defaultMessage="Contiguous Select"
      />,
      'A',
      {
        radius: {
          type: 'number',
          label: (
            <FormattedMessage
              id="tool.contiguous_select.radius"
              defaultMessage="Radius:"
            />
          ),
          defaultValue: 1.0,
          step: 0.01,
          wheelStep: 0.1,
          min: 0.0,
        },
      },
      ...args,
    );
  }

  _processHovered(additive: boolean) {
    const resource = store.getState().resource;
    if (!(resource instanceof Scene)) {
      return;
    }
    const remainingEntities: Set<Entity> = new Set();
    for (const id of this.props.hoverStates.keys()) {
      const entity = resource.getEntity(id);
      entity && remainingEntities.add(entity);
    }
    const radius = getValue(this.props.options.radius, 1.0);
    const map: {[string]: boolean} = {};
    while (remainingEntities.size > 0) {
      for (const entity of remainingEntities) {
        map[entity.id] = additive ? !this.props.selection.has(entity.id) : true;
        remainingEntities.delete(entity);
        const collisionGeometry = getCollisionGeometry(resource.idTree, entity);
        if (!collisionGeometry) {
          continue;
        }
        const inverseWorldTransform = invertTransform(
          entity.getLastCachedValue('worldTransform'),
        );
        resource.applyToEntities(
          this.props.page,
          expandBounds(resource.getWorldBounds(entity.id), radius),
          entity => {
            if (map[entity.id] !== undefined) {
              return;
            }
            const otherCollisionGeometry = getCollisionGeometry(
              resource.idTree,
              entity,
            );
            if (
              otherCollisionGeometry &&
              otherCollisionGeometry.intersects(
                collisionGeometry,
                composeTransforms(
                  inverseWorldTransform,
                  entity.getLastCachedValue('worldTransform'),
                ),
                radius,
              )
            ) {
              remainingEntities.add(entity);
            }
          },
        );
      }
    }
    store.dispatch(StoreActions.select.create(map, additive));
    store.dispatch(StoreActions.setHoverStates.create(new Map()));
  }
}
const ContiguousSelectTool = connectTool(ContiguousSelectToolImpl);

class EraseToolImpl extends HoverToolImpl {
  get _rectColor(): string {
    return ERASE_COLOR;
  }

  constructor(...args: any[]) {
    super(
      'erase',
      'eraser',
      <FormattedMessage id="tool.erase" defaultMessage="Erase" />,
      'S',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
      },
      ...args,
    );
  }

  _allowHover(entity: Entity): boolean {
    const resource = store.getState().resource;
    return resource instanceof Scene && !resource.isInitialEntity(entity.id);
  }

  _processHovered(additive: boolean) {
    if (this.props.hoverStates.size === 0) {
      return;
    }
    const map = {};
    for (const id of this.props.hoverStates.keys()) {
      map[id] = null;
    }
    store.dispatch(SceneActions.editEntities.create(map));
    store.dispatch(StoreActions.setHoverStates.create(new Map()));
  }
}
const EraseTool = connectTool(EraseToolImpl);

class DrawToolImpl extends ToolImpl {
  _lastClientX = -1;
  _lastClientY = -1;
  _translation = vec2();

  _onMouseMove = (event: MouseEvent) => {
    this._lastClientX = event.clientX;
    this._lastClientY = event.clientY;
    this.active &&
      this.props.renderer &&
      this.props.renderer.requestFrameRender();
  };

  _renderHelpers = (renderer: Renderer) => {
    if (!this.active) {
      return;
    }
    this._translation = this._getMousePosition(
      renderer,
      this._lastClientX,
      this._lastClientY,
    );
    this._displayMousePosition(this._translation);
    this._renderDrawHelper(renderer, this._translation);
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    throw new Error('Not implemented.');
  }
}

class PointToolImpl extends DrawToolImpl {
  constructor(...args: any[]) {
    super(
      'point',
      'dot-circle',
      <FormattedMessage id="tool.point" defaultMessage="Point" />,
      'D',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
        ...ThicknessProperty,
        ...PathColorProperty,
        ...DynamicProperty,
      },
      ...args,
    );
  }

  _onMouseDown = (event: MouseEvent) => {
    this.active &&
      event.button === 0 &&
      createEntity(
        GeometryComponents.point.label,
        this.props.locale,
        {
          point: {
            thickness: this.props.options.thickness,
            order: 1,
          },
          shapeRenderer: {
            pathColor: this.props.options.pathColor,
            order: 2,
          },
          shapeCollider: {order: 3},
          rigidBody: {
            dynamic: this.props.options.dynamic,
            order: 4,
          },
        },
        {translation: equals(this._translation)},
      );
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    renderPointHelper(
      renderer,
      {translation},
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
    );
  }
}
const PointTool = connectTool(PointToolImpl);

class LineToolImpl extends DrawToolImpl {
  _start: ?Vector2;

  constructor(...args: any[]) {
    super(
      'line',
      'pencil-alt',
      <FormattedMessage id="tool.line" defaultMessage="Line" />,
      'F',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
        ...ThicknessProperty,
        ...PathColorProperty,
        ...DynamicProperty,
      },
      ...args,
    );
  }

  _onMouseDown = (event: MouseEvent) => {
    if (this.active && event.button === 0) {
      this._start = equals(this._translation);
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    const start = this._start;
    if (!start) {
      return;
    }
    createEntity(
      GeometryComponents.line.label,
      this.props.locale,
      {
        line: {
          thickness: this.props.options.thickness,
          length: distance(start, this._translation),
          order: 1,
        },
        shapeRenderer: {
          pathColor: this.props.options.pathColor,
          order: 2,
        },
        shapeCollider: {order: 3},
        rigidBody: {
          dynamic: this.props.options.dynamic,
          order: 4,
        },
      },
      this._getTransform(),
    );
    this._start = null;
    this.props.renderer && this.props.renderer.requestFrameRender();
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    const start = this._start;
    if (!start) {
      renderPointHelper(
        renderer,
        this._getTransform(),
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
      );
      return;
    }
    renderLineHelper(
      renderer,
      this._getTransform(),
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
      distance(start, translation),
    );
  }

  _getTransform(): Transform {
    const start = this._start;
    if (!start) {
      return {translation: equals(this._translation)};
    }
    const vector = minus(this._translation, start);
    return {
      translation: timesEquals(plus(start, this._translation), 0.5),
      rotation: Math.atan2(vector.y, vector.x),
    };
  }
}
const LineTool = connectTool(LineToolImpl);

class VertexToolImpl extends DrawToolImpl {
  _vertices: Vector2[] = [];

  get _loop(): boolean {
    return true;
  }

  get _centroid(): Vector2 {
    return getMean(this._vertices);
  }

  _onMouseDown = (event: MouseEvent) => {
    const lastIndex = this._vertices.length - 1;
    if (lastIndex >= 0) {
      if (
        event.button === 2 ||
        distance(this._vertices[lastIndex], this._translation) === 0.0
      ) {
        const translation = this._centroid;
        for (const vertex of this._vertices) {
          minusEquals(vertex, translation);
        }
        this._createEntity({translation});
        this._vertices = [];
      } else {
        this._vertices.push(equals(this._translation));
      }
      this.props.renderer && this.props.renderer.requestFrameRender();
    } else if (this.active && event.button === 0) {
      this._vertices.push(equals(this._translation));
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _createEntity(transform: Transform) {
    throw new Error('Not implemented.');
  }

  _onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  _onMouseUp = (event: MouseEvent) => {
    const lastIndex = this._vertices.length - 1;
    if (lastIndex !== 0) {
      return;
    }
    if (distance(this._translation, this._vertices[lastIndex]) > 0) {
      this._vertices.push(equals(this._translation));
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    if (this._vertices.length === 0) {
      renderPointHelper(
        renderer,
        {translation: equals(this._translation)},
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
      );
    } else {
      this._drawVertices(renderer);
    }
  }

  _drawVertices(renderer: Renderer) {
    for (let ii = 0; ii < this._vertices.length; ii++) {
      this._drawLine(
        renderer,
        this._vertices[ii],
        this._vertices[ii + 1] || this._translation,
      );
    }
    if (this._loop && this._vertices.length > 1) {
      this._drawLine(renderer, this._translation, this._vertices[0]);
    }
  }

  _drawLine(renderer: Renderer, start: Vector2, end: Vector2) {
    const vector = minus(end, start);
    renderLineHelper(
      renderer,
      {
        translation: timesEquals(plus(start, end), 0.5),
        rotation: Math.atan2(vector.y, vector.x),
      },
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
      distance(start, end),
    );
  }
}

class LineGroupToolImpl extends VertexToolImpl {
  get _loop(): boolean {
    return getValue(this.props.options.loop, LoopProperty.loop.defaultValue);
  }

  constructor(...args: any[]) {
    super(
      'lineGroup',
      'project-diagram',
      <FormattedMessage id="tool.line_group" defaultMessage="Line Group" />,
      'G',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
        ...ThicknessProperty,
        ...PathColorProperty,
        ...LoopProperty,
        ...DynamicProperty,
      },
      ...args,
    );
  }

  _createEntity(transform: Transform) {
    createEntity(
      GeometryComponents.lineGroup.label,
      this.props.locale,
      {
        lineGroup: {
          thickness: this.props.options.thickness,
          vertices: this._vertices,
          loop: this.props.options.loop,
          order: 1,
        },
        shapeRenderer: {
          pathColor: this.props.options.pathColor,
          order: 2,
        },
        shapeCollider: {order: 3},
        rigidBody: {
          dynamic: this.props.options.dynamic,
          order: 4,
        },
      },
      transform,
    );
  }
}
const LineGroupTool = connectTool(LineGroupToolImpl);

class PolygonToolImpl extends VertexToolImpl {
  _geometry: ?Geometry;

  get _centroid(): Vector2 {
    return getCentroid(this._vertices);
  }

  constructor(...args: any[]) {
    super(
      'polygon',
      'draw-polygon',
      <FormattedMessage id="tool.polygon" defaultMessage="Polygon" />,
      'Z',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
        ...ThicknessProperty,
        ...PathColorProperty,
        ...FillColorProperty,
        ...FillProperty,
        ...DynamicProperty,
      },
      ...args,
    );
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    this._clearGeometry();
  }

  _drawVertices(renderer: Renderer) {
    const fill = getValue(
      this.props.options.fill,
      FillProperty.fill.defaultValue,
    );
    if (!fill || this._vertices.length === 1) {
      super._drawVertices(renderer);
      return;
    }
    this._clearGeometry();
    const path = new Path(true);
    if (this._shouldReverse()) {
      path.moveTo(equals(this._translation));
      for (let ii = this._vertices.length - 1; ii >= 0; ii--) {
        path.lineTo(this._vertices[ii]);
      }
      path.lineTo(equals(this._translation));
    } else {
      path.moveTo(this._vertices[0]);
      for (let ii = 1; ii < this._vertices.length; ii++) {
        path.lineTo(this._vertices[ii]);
      }
      path.lineTo(equals(this._translation));
      path.lineTo(this._vertices[0]);
    }
    const geometry = (this._geometry = new Geometry(
      ...new ShapeList([new Shape(path)]).createGeometry(),
    ));
    geometry.ref();
    renderPolygonHelper(
      renderer,
      null,
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
      getValue(
        this.props.options.fillColor,
        FillColorProperty.fillColor.defaultValue,
      ),
      geometry,
    );
  }

  _createEntity(transform: Transform) {
    if (this._shouldReverse()) {
      this._vertices.reverse();
    }
    createEntity(
      GeometryComponents.polygon.label,
      this.props.locale,
      {
        polygon: {
          thickness: this.props.options.thickness,
          vertices: this._vertices,
          fill: this.props.options.fill,
          order: 1,
        },
        shapeRenderer: {
          pathColor: this.props.options.pathColor,
          fillColor: this.props.options.fillColor,
          order: 2,
        },
        shapeCollider: {order: 3},
        rigidBody: {
          dynamic: this.props.options.dynamic,
          order: 4,
        },
      },
      transform,
    );
    this._clearGeometry();
  }

  _shouldReverse(): boolean {
    return getSignedArea(this._vertices) < 0.0;
  }

  _clearGeometry() {
    if (this._geometry) {
      this._geometry.deref();
      this._geometry = null;
    }
  }
}
const PolygonTool = connectTool(PolygonToolImpl);

class RectangleToolImpl extends DrawToolImpl {
  _start: ?Vector2;

  constructor(...args: any[]) {
    super(
      'rectangle',
      'vector-square',
      <FormattedMessage id="tool.rectangle" defaultMessage="Rectangle" />,
      'X',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
        ...ThicknessProperty,
        ...PathColorProperty,
        ...FillColorProperty,
        ...FillProperty,
        ...DynamicProperty,
      },
      ...args,
    );
  }

  _onMouseDown = (event: MouseEvent) => {
    if (this.active && event.button === 0) {
      this._start = equals(this._translation);
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    const start = this._start;
    if (!start) {
      return;
    }
    createEntity(
      GeometryComponents.rectangle.label,
      this.props.locale,
      {
        rectangle: {
          thickness: this.props.options.thickness,
          width: Math.abs(this._translation.x - start.x),
          height: Math.abs(this._translation.y - start.y),
          fill: this.props.options.fill,
          order: 1,
        },
        shapeRenderer: {
          pathColor: this.props.options.pathColor,
          fillColor: this.props.options.fillColor,
          order: 2,
        },
        shapeCollider: {order: 3},
        rigidBody: {
          dynamic: this.props.options.dynamic,
          order: 4,
        },
      },
      this._getTransform(),
    );
    this._start = null;
    this.props.renderer && this.props.renderer.requestFrameRender();
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    const start = this._start;
    if (!start) {
      renderPointHelper(
        renderer,
        this._getTransform(),
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
      );
      return;
    }
    renderRectangleHelper(
      renderer,
      this._getTransform(),
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
      getValue(
        this.props.options.fillColor,
        FillColorProperty.fillColor.defaultValue,
      ),
      getValue(this.props.options.fill, FillProperty.fill.defaultValue),
      Math.abs(translation.x - start.x),
      Math.abs(translation.y - start.y),
    );
  }

  _getTransform(): Transform {
    const start = this._start;
    if (!start) {
      return {translation: equals(this._translation)};
    }
    const vector = minus(this._translation, start);
    return {
      translation: timesEquals(plus(start, this._translation), 0.5),
    };
  }
}
const RectangleTool = connectTool(RectangleToolImpl);

class ArcToolImpl extends DrawToolImpl {
  _center: ?Vector2;
  _startVector: ?Vector2;
  _reversed: ?boolean;

  constructor(...args: any[]) {
    super(
      'arc',
      'circle-notch',
      <FormattedMessage id="tool.arc" defaultMessage="Arc" />,
      'C',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
        ...ThicknessProperty,
        ...PathColorProperty,
        ...FillColorProperty,
        ...FillProperty,
        ...DynamicProperty,
      },
      ...args,
    );
  }

  _onMouseDown = (event: MouseEvent) => {
    const center = this._center;
    const startVector = this._startVector;
    if (center && startVector) {
      const radius = length(startVector);
      const currentVector = minus(this._translation, center);
      const baseAngle = Math.acos(
        clamp(
          dot(startVector, currentVector) / (radius * length(currentVector)),
          -1.0,
          1.0,
        ),
      );
      let angle =
        cross(startVector, currentVector) > 0
          ? baseAngle
          : 2 * Math.PI - baseAngle;
      if (this._reversed) {
        angle -= 2.0 * Math.PI;
      }
      createEntity(
        GeometryComponents.arc.label,
        this.props.locale,
        {
          arc: {
            thickness: this.props.options.thickness,
            radius,
            angle,
            fill: this.props.options.fill,
            order: 1,
          },
          shapeRenderer: {
            pathColor: this.props.options.pathColor,
            fillColor: this.props.options.fillColor,
            order: 2,
          },
          shapeCollider: {order: 3},
          rigidBody: {
            dynamic: this.props.options.dynamic,
            order: 4,
          },
        },
        this._getTransform(),
      );
      this._center = null;
      this._startVector = null;
      this._reversed = null;
      this.props.renderer && this.props.renderer.requestFrameRender();
    } else if (center) {
      this._startVector = minus(this._translation, center);
      this.props.renderer && this.props.renderer.requestFrameRender();
    } else if (this.active && event.button === 0) {
      this._center = equals(this._translation);
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    const center = this._center;
    if (!center) {
      return;
    }
    if (!this._startVector && distance(this._translation, center) > 0) {
      this._startVector = minus(this._translation, center);
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    const center = this._center;
    const transform = this._getTransform();
    if (!center) {
      renderPointHelper(
        renderer,
        transform,
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
      );
      return;
    }
    const startVector = this._startVector;
    if (!startVector) {
      renderArcHelper(
        renderer,
        transform,
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
        getValue(
          this.props.options.fillColor,
          FillColorProperty.fillColor.defaultValue,
        ),
        getValue(this.props.options.fill, FillProperty.fill.defaultValue),
        distance(center, this._translation),
        2 * Math.PI,
      );
      return;
    }
    const radius = length(startVector);
    const currentVector = minus(this._translation, center);
    if (this._reversed == null) {
      const cp = cross(startVector, currentVector);
      if (cp !== 0.0) {
        this._reversed = cp < 0.0;
      }
    }
    const baseAngle = Math.acos(
      clamp(
        dot(startVector, currentVector) / (radius * length(currentVector)),
        -1.0,
        1.0,
      ),
    );
    let angle =
      cross(startVector, currentVector) > 0
        ? baseAngle
        : 2 * Math.PI - baseAngle;
    if (this._reversed) {
      angle -= 2.0 * Math.PI;
    }
    renderArcHelper(
      renderer,
      transform,
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
      getValue(
        this.props.options.fillColor,
        FillColorProperty.fillColor.defaultValue,
      ),
      getValue(this.props.options.fill, FillProperty.fill.defaultValue),
      radius,
      angle,
    );
  }

  _getTransform(): Transform {
    const center = this._center;
    if (!center) {
      return {translation: equals(this._translation)};
    }
    const startVector = this._startVector;
    if (!startVector) {
      return {translation: center};
    }
    return {
      translation: center,
      rotation: Math.atan2(startVector.y, startVector.x),
    };
  }
}
const ArcTool = connectTool(ArcToolImpl);

class CurveToolImpl extends DrawToolImpl {
  _start: ?Vector2;
  _end: ?Vector2;
  _controlCenter: ?Vector2;

  constructor(...args: any[]) {
    super(
      'curve',
      'bezier-curve',
      <FormattedMessage id="tool.curve" defaultMessage="Bezier Curve" />,
      'V',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
        ...ThicknessProperty,
        ...PathColorProperty,
        ...DynamicProperty,
      },
      ...args,
    );
  }

  _onMouseDown = (event: MouseEvent) => {
    const controlCenter = this._controlCenter;
    const start = this._start;
    const end = this._end;
    if (controlCenter && start && end) {
      const transform = this._getTransform();
      const controlPoint = transformPoint(
        controlCenter,
        getTransformInverseMatrix(transform),
      );
      const rightPoint = transformPoint(
        this._translation,
        getTransformInverseMatrix(transform),
      );
      createEntity(
        GeometryComponents.curve.label,
        this.props.locale,
        {
          curve: {
            thickness: this.props.options.thickness,
            span: distance(start, end),
            c1: minusEquals(times(controlPoint, 2.0), rightPoint),
            c2: rightPoint,
            order: 1,
          },
          shapeRenderer: {
            pathColor: this.props.options.pathColor,
            order: 2,
          },
          shapeCollider: {order: 3},
          rigidBody: {
            dynamic: this.props.options.dynamic,
            order: 4,
          },
        },
        transform,
      );
      this._start = null;
      this._end = null;
      this._controlCenter = null;
      this.props.renderer && this.props.renderer.requestFrameRender();
    } else if (end) {
      this._controlCenter = equals(this._translation);
      this.props.renderer && this.props.renderer.requestFrameRender();
    } else if (start) {
      this._end = equals(this._translation);
      this.props.renderer && this.props.renderer.requestFrameRender();
    } else if (this.active && event.button === 0) {
      this._start = equals(this._translation);
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    const start = this._start;
    if (!start) {
      return;
    }
    if (!this._end && distance(start, this._translation) > 0) {
      this._end = equals(this._translation);
      this.props.renderer && this.props.renderer.requestFrameRender();
    }
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    const start = this._start;
    const transform = this._getTransform();
    if (!start) {
      renderPointHelper(
        renderer,
        transform,
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
      );
      return;
    }
    const end = this._end;
    if (!end) {
      renderLineHelper(
        renderer,
        transform,
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
        distance(start, this._translation),
      );
      return;
    }
    const controlCenter = this._controlCenter;
    if (!controlCenter) {
      const controlPoint = transformPoint(
        this._translation,
        getTransformInverseMatrix(transform),
      );
      renderPointHelper(
        renderer,
        {translation: this._translation},
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
      );
      renderCurveHelper(
        renderer,
        transform,
        getValue(this.props.options.thickness, DEFAULT_THICKNESS),
        getValue(
          this.props.options.pathColor,
          PathColorProperty.pathColor.defaultValue,
        ),
        distance(start, end),
        controlPoint,
        controlPoint,
      );
      return;
    }
    const controlPoint = transformPoint(
      controlCenter,
      getTransformInverseMatrix(transform),
    );
    const rightPoint = transformPoint(
      this._translation,
      getTransformInverseMatrix(transform),
    );
    renderLineHelper(
      renderer,
      {
        translation: controlCenter,
        rotation: Math.atan2(
          controlCenter.y - this._translation.y,
          controlCenter.x - this._translation.x,
        ),
      },
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
      2.0 * distance(rightPoint, controlPoint),
      true,
    );
    renderCurveHelper(
      renderer,
      transform,
      getValue(this.props.options.thickness, DEFAULT_THICKNESS),
      getValue(
        this.props.options.pathColor,
        PathColorProperty.pathColor.defaultValue,
      ),
      distance(start, end),
      minusEquals(times(controlPoint, 2.0), rightPoint),
      rightPoint,
    );
  }

  _getTransform(): Transform {
    const start = this._start;
    if (!start) {
      return {translation: equals(this._translation)};
    }
    const end = this._end || this._translation;
    const vector = minus(end, start);
    return {
      translation: timesEquals(plus(start, end), 0.5),
      rotation: Math.atan2(vector.y, vector.x),
    };
  }
}
const CurveTool = connectTool(CurveToolImpl);

class StampToolImpl extends DrawToolImpl {
  _transform: Transform;

  constructor(...args: any[]) {
    super(
      'stamp',
      'stamp',
      <FormattedMessage id="tool.stamp" defaultMessage="Clone Stamp" />,
      'B',
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }

  _onMouseDown = (event: MouseEvent) => {
    const state = store.getState();
    const resource = state.resource;
    if (
      !(
        this.active &&
        event.button === 0 &&
        this.props.selection.size > 0 &&
        resource instanceof Scene
      )
    ) {
      return;
    }
    const entities: Map<string, Object> = new Map();
    for (const id of this.props.selection) {
      const entity = resource.getEntity(id);
      if (!entity || resource.isInitialEntity(id)) {
        continue;
      }
      const transform = Object.assign(
        {},
        entity.state.transform,
        simplifyTransform(
          composeTransforms(
            this._transform,
            entity.getLastCachedValue('worldTransform'),
          ),
        ),
      );
      entities.set(id, Object.assign({}, entity.state, {transform}));
    }
    if (entities.size === 0) {
      return;
    }
    const action = createPasteAction(state, entities, state.page);
    action && store.dispatch(action);
  };

  _renderDrawHelper(renderer: Renderer, translation: Vector2) {
    const resource = store.getState().resource;
    if (!(this.props.selection.size > 0 && resource instanceof Scene)) {
      return;
    }
    const entityZOrders: EntityZOrder[] = [];
    const totalTranslation = vec2();
    for (const id of this.props.selection) {
      const entity = resource.getEntity(id);
      if (!entity || resource.isInitialEntity(id)) {
        continue;
      }
      entityZOrders.push(
        entity.getCachedValue('entityZOrder', getEntityZOrder, entity),
      );
      const transform: Transform = entity.getLastCachedValue('worldTransform');
      plusEquals(totalTranslation, getTransformTranslation(transform));
    }
    if (entityZOrders.length === 0) {
      return;
    }
    this._transform = {
      translation: minus(
        translation,
        timesEquals(totalTranslation, 1.0 / this.props.selection.size),
      ),
    };
    entityZOrders.sort(compareEntityZOrders);
    renderer.bindFramebuffer(renderer.alphaBuffer);
    renderer.setClearColor('#000000');
    const gl = renderer.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const entityZOrder of entityZOrders) {
      const entity = entityZOrder.entity;
      entity.getCachedValue(
        'entityRenderer',
        getEntityRenderer,
        resource.idTree,
        entity,
      )(renderer, false, this._transform);
    }
    renderer.bindFramebuffer(null);
    renderer.renderAlphaBuffer();
  }
}
const StampTool = connectTool(StampToolImpl);
