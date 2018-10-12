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
import type {ToolType} from './store';
import {StoreActions, store} from './store';
import type {PropertyData} from './component';
import {PropertyEditorGroup} from './component';
import type {Renderer} from './renderer/util';
import type {HoverType} from './renderer/helpers';
import {
  renderRectangle,
  renderAxes,
  renderTranslationHandle,
  renderRotationHandle,
  renderScaleHandle,
} from './renderer/helpers';
import type {Resource} from '../server/store/resource';
import {Scene, SceneActions} from '../server/store/scene';
import type {Vector2, LineSegment, Transform} from '../server/store/math';
import {
  invertTransform,
  simplifyTransform,
  composeTransforms,
  getTransformTranslation,
  getTransformRotation,
  getTransformScale,
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
} from '../server/store/math';

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

class ToolsetImpl extends React.Component<
  {
    resource: ?Resource,
    selection: Set<string>,
    tool: ToolType,
    renderer: ?Renderer,
  },
  {options: ?React.Element<any>},
> {
  state = {options: null};

  render() {
    const {tool, ...otherProps} = this.props;
    const toolProps: ToolProps = (otherProps: any);
    toolProps.activeTool = tool;
    toolProps.setOptions = this._setOptions;
    return (
      <div>
        <Nav
          tabs
          className="pt-2 bg-black play-controls justify-content-center">
          <ButtonGroup>
            <PlayControl icon="play" />
            <PlayControl icon="pause" disabled />
            <PlayControl icon="stop" disabled />
            <PlayControl icon="fast-backward" disabled />
            <PlayControl icon="fast-forward" disabled />
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
          {this.state.options}
        </div>
      </div>
    );
  }

  _setOptions = (options: ?React.Element<any>) => this.setState({options});
}

/**
 * The set of tools available.
 */
export const Toolset = ReactRedux.connect(state => ({
  resource: state.resource,
  selection: state.selection,
  tool: state.tool,
}))(ToolsetImpl);

function PlayControl(props: {icon: string, disabled?: boolean}) {
  return (
    <Button color="link" disabled={props.disabled}>
      <FontAwesomeIcon icon={props.icon} />
    </Button>
  );
}

type ToolProps = {
  activeTool: ToolType,
  resource: ?Resource,
  selection: Set<string>,
  renderer: ?Renderer,
  setOptions: (?React.Element<any>) => void,
};

class Tool extends React.Component<ToolProps, Object> {
  state = {};

  _type: ToolType;
  _icon: string;
  _name: React.Element<any>;
  _options: {[string]: PropertyData};

  /** Checks whether the tool is active. */
  get active(): boolean {
    return this.props.activeTool === this._type;
  }

  constructor(
    type: ToolType,
    icon: string,
    name: React.Element<any>,
    options: {[string]: PropertyData},
    ...args: any[]
  ) {
    super(...args);
    this._type = type;
    this._icon = icon;
    this._name = name;
    this._options = options;
  }

  render() {
    return [
      <Button
        key="button"
        id={this._type}
        color="primary"
        active={this.active}
        onClick={() => store.dispatch(StoreActions.setTool.create(this._type))}>
        <FontAwesomeIcon icon={this._icon} />
      </Button>,
      <UncontrolledTooltip
        key="tooltip"
        delay={{show: 750, hide: 0}}
        target={this._type}>
        {this._name}
      </UncontrolledTooltip>,
    ];
  }

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
      const wasActive = prevProps.activeTool === this._type;
      if (wasActive !== this.active) {
        wasActive ? this._onDeactivate(renderer) : this._onActivate(renderer);
      }
    }
    if (!(this.active && renderer)) {
      return;
    }
    let stateChanged = false;
    for (const key in this.state) {
      if (this.state[key] !== prevState[key]) {
        stateChanged = true;
        break;
      }
    }
    if (stateChanged) {
      this._updateOptions();
      renderer.requestFrameRender();
    }
  }

  _subscribeToRenderer(renderer: Renderer) {
    renderer.addRenderCallback(this._renderHelpers);
    renderer.canvas.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('mousemove', this._onMouseMove);
    renderer.canvas.addEventListener('wheel', this._onWheel);
    this.active && this._onActivate(renderer);
  }

  _unsubscribeFromRenderer(renderer: Renderer) {
    renderer.removeRenderCallback(this._renderHelpers);
    renderer.canvas.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    renderer.canvas.removeEventListener('wheel', this._onWheel);
    this.active && this._onDeactivate(renderer);
  }

  _onActivate(renderer: Renderer) {
    this._updateOptions();
    renderer.requestFrameRender();
  }

  _onDeactivate(renderer: Renderer) {
    // nothing by default
  }

  _updateOptions() {
    this.props.setOptions(this._renderOptions());
  }

  _renderOptions(): ?React.Element<any> {
    return (
      <Container className="mt-1">
        <PropertyEditorGroup
          properties={this._options}
          labelSize={6}
          padding={false}
          values={this.state}
          setValue={(key, value) => this.setState({[key]: value})}
        />
      </Container>
    );
  }

  _renderHelpers = (renderer: Renderer) => {
    // nothing by default
  };

  _getSelectionTransform(renderer: Renderer, withScale?: boolean): Transform {
    const resource = this.props.resource;
    const selectionSize = this.props.selection.size;
    if (!(resource instanceof Scene && selectionSize > 0)) {
      return null;
    }
    const translation = vec2();
    let rotation: ?number;
    const pixelsToWorldUnits = renderer.pixelsToWorldUnits;
    let scale = vec2(pixelsToWorldUnits, pixelsToWorldUnits);
    for (const id of this.props.selection) {
      // if we have children and their parents, we only want the parents
      if (resource.isAncestorInSet(id, this.props.selection)) {
        continue;
      }
      const transform = resource.getWorldTransform(id);
      plusEquals(translation, getTransformTranslation(transform));
      if (rotation == null) {
        rotation = getTransformRotation(transform);
        withScale && equals(getTransformScale(transform), scale);
      }
    }
    timesEquals(translation, 1.0 / selectionSize);
    return {translation, rotation, scale};
  }

  _onMouseDown = (event: MouseEvent) => {
    // nothing by default
  };

  _onMouseUp = (event: MouseEvent) => {
    // nothing by default
  };

  _onMouseMove = (event: MouseEvent) => {
    // nothing by default
  };

  _onWheel = (event: WheelEvent) => {
    // nothing by default
  };
}

function GridSnapLabel() {
  return <FormattedMessage id="tool.grid_snap" defaultMessage="Grid Snap:" />;
}

function FeatureSnapLabel() {
  return (
    <FormattedMessage id="tool.feature_snap" defaultMessage="Feature Snap:" />
  );
}

class SelectPanTool extends Tool {
  _panning = false;

  constructor(...args: any[]) {
    super(
      'selectPan',
      'mouse-pointer',
      <FormattedMessage id="tool.select_pan" defaultMessage="Select/Pan" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }

  _renderHelpers = (renderer: Renderer) => {
    if (
      this.props.activeTool === 'translate' ||
      this.props.activeTool === 'rotate' ||
      this.props.activeTool === 'scale'
    ) {
      return; // transform tools have their own axes
    }
    const transform = this._getSelectionTransform(renderer);
    transform && renderAxes(renderer, transform);
  };

  _onMouseDown = (event: MouseEvent) => {
    if (this.active && event.button === 0) {
      (document.body: any).style.cursor = 'all-scroll';
      this._panning = true;
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    if (this._panning) {
      (document.body: any).style.cursor = null;
      this._panning = false;
    }
  };

  _onMouseMove = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    if (!(renderer && this._panning)) {
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
  };

  _onWheel = (event: WheelEvent) => {
    const renderer = this.props.renderer;
    if (!renderer) {
      return;
    }
    store.dispatch(
      StoreActions.setPageSize.create(
        renderer.camera.size * Math.pow(1.01, event.deltaY),
      ),
    );
  };
}

function getMousePosition(
  renderer: Renderer,
  gridSnap: ?boolean,
  event: MouseEvent,
): Vector2 {
  const position = renderer.getEventPosition(event.clientX, event.clientY);
  gridSnap && roundEquals(position);
  return position;
}

class RectSelectTool extends Tool {
  _rect: ?LineSegment;

  constructor(...args: any[]) {
    super(
      'rectSelect',
      'expand',
      <FormattedMessage id="tool.rect_select" defaultMessage="Rect Select" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
      },
      ...args,
    );
  }

  _onActivate(renderer: Renderer) {
    super._onActivate(renderer);
    renderer.canvas.style.cursor = 'crosshair';
  }

  _onDeactivate(renderer: Renderer) {
    super._onDeactivate(renderer);
    renderer.canvas.style.cursor = 'inherit';
  }

  _renderHelpers = (renderer: Renderer) => {
    this._rect && renderRectangle(renderer, this._rect, '#00bc8c');
  };

  _onMouseDown = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    if (this.active && event.button === 0 && renderer) {
      const position = getMousePosition(renderer, this.state.gridSnap, event);
      this._rect = {start: position, end: position};
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    if (this._rect && this.props.renderer) {
      this._rect = null;
      this.props.renderer.requestFrameRender();
    }
  };

  _onMouseMove = (event: MouseEvent) => {
    const renderer = this.props.renderer;
    if (!(renderer && this._rect)) {
      return;
    }
    const position = getMousePosition(renderer, this.state.gridSnap, event);
    this._rect = Object.assign({}, this._rect, {end: position});
    renderer.requestFrameRender();
  };
}

class ContiguousSelectTool extends Tool {
  constructor(...args: any[]) {
    super(
      'contiguousSelect',
      'magic',
      <FormattedMessage
        id="tool.contiguous_select"
        defaultMessage="Contiguous Select"
      />,
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
}

class HandleTool extends Tool {
  _relativePosition = vec2();
  _position: ?Vector2;
  _rotation = 0.0;
  _scale: ?Vector2;
  _hover: HoverType = 'xy';
  _pressed = false;

  get _local(): boolean {
    return !!this.state.local;
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
      return;
    }
    const vector = minusEquals(
      renderer.getWorldPosition(event.offsetX, event.offsetY),
      position,
    );
    rotateEquals(vector, -this._rotation);

    if (this._pressed) {
      const resource = this.props.resource;
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
      let hover: HoverType = 'xy';
      const outerRadius = renderer.pixelsToWorldUnits * 40.0;
      const len = length(vector);
      if (len < outerRadius) {
        const innerRadius = renderer.pixelsToWorldUnits * 15.0;
        if (len > innerRadius) {
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
    if (this._pressed) {
      this._pressed = false;
      this.props.renderer && this.props.renderer.requestFrameRender();
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

class TranslateTool extends HandleTool {
  constructor(...args: any[]) {
    super(
      'translate',
      'arrows-alt',
      <FormattedMessage id="tool.translate" defaultMessage="Translate" />,
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
    this.state.gridSnap && roundEquals(newPosition);
    const translation = minus(newPosition, oldPosition);
    if (this._hover !== 'xy') {
      const axis = this._hover === 'x' ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      rotateEquals(axis, this._rotation);
      times(axis, dot(axis, translation), translation);
      if (this.state.gridSnap) {
        roundEquals(plus(oldPosition, translation, newPosition));
        minus(newPosition, oldPosition, translation);
        if (this.state.local) {
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
    return length(translation) < 0.001 ? null : {translation};
  }
}

class RotateTool extends HandleTool {
  get _local(): boolean {
    return true;
  }

  constructor(...args: any[]) {
    super(
      'rotate',
      'sync-alt',
      <FormattedMessage id="tool.rotate" defaultMessage="Rotate" />,
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
    const sourceRotation = this._rotation;
    const from = normalizeEquals(
      minusEquals(plus(oldPosition, this._relativePosition), handlePosition),
    );
    const to = normalizeEquals(
      minusEquals(plus(newPosition, this._relativePosition), handlePosition),
    );
    let destRotation = sourceRotation + Math.asin(cross(from, to));
    if (this.state.snap) {
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

function roundScale(scale: number): number {
  return Math.abs(scale) < 1.0
    ? 1.0 / Math.round(1.0 / scale)
    : Math.round(scale);
}

class ScaleTool extends HandleTool {
  get _local(): boolean {
    return this.state.local !== false;
  }

  constructor(...args: any[]) {
    super(
      'scale',
      'compress',
      <FormattedMessage id="tool.scale" defaultMessage="Scale" />,
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
    const from = rotate(worldScale, this._rotation);
    const to = minusEquals(
      plus(newPosition, this._relativePosition),
      handlePosition,
    );
    to.x /= this._relativePosition.x;
    to.y /= this._relativePosition.y;
    const axisX = rotateEquals(vec2(1.0, 0.0), this._rotation);
    const axisY = orthogonalize(axisX);
    const scale = vec2(1.0, 1.0);
    if (this._hover !== 'y') {
      const fromScale = dot(from, axisX);
      let toScale = dot(to, axisX);
      if (this.state.snap) {
        toScale = roundScale(toScale);
      }
      if (fromScale !== 0.0 && toScale !== 0.0) {
        scale.x = toScale / fromScale;
      }
    }
    if (this._hover !== 'x') {
      const fromScale = dot(from, axisY);
      let toScale = dot(to, axisY);
      if (this.state.snap) {
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

class EraseTool extends Tool {
  constructor(...args: any[]) {
    super(
      'erase',
      'eraser',
      <FormattedMessage id="tool.erase" defaultMessage="Erase" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
      },
      ...args,
    );
  }
}

class PointTool extends Tool {
  constructor(...args: any[]) {
    super(
      'point',
      'dot-circle',
      <FormattedMessage id="tool.point" defaultMessage="Point" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}

class LineTool extends Tool {
  constructor(...args: any[]) {
    super(
      'line',
      'pencil-alt',
      <FormattedMessage id="tool.line" defaultMessage="Line" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}

class LineGroupTool extends Tool {
  constructor(...args: any[]) {
    super(
      'lineGroup',
      'project-diagram',
      <FormattedMessage id="tool.line_group" defaultMessage="Line Group" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}

class PolygonTool extends Tool {
  constructor(...args: any[]) {
    super(
      'polygon',
      'draw-polygon',
      <FormattedMessage id="tool.polygon" defaultMessage="Polygon" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}

class RectangleTool extends Tool {
  constructor(...args: any[]) {
    super(
      'rectangle',
      'vector-square',
      <FormattedMessage id="tool.rectangle" defaultMessage="Rectangle" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}

class ArcTool extends Tool {
  constructor(...args: any[]) {
    super(
      'arc',
      'circle-notch',
      <FormattedMessage id="tool.arc" defaultMessage="Arc" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}

class CurveTool extends Tool {
  constructor(...args: any[]) {
    super(
      'curve',
      'bezier-curve',
      <FormattedMessage id="tool.curve" defaultMessage="Bezier Curve" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}

class StampTool extends Tool {
  constructor(...args: any[]) {
    super(
      'stamp',
      'stamp',
      <FormattedMessage id="tool.stamp" defaultMessage="Clone Stamp" />,
      {
        gridSnap: {type: 'boolean', label: <GridSnapLabel />},
        featureSnap: {type: 'boolean', label: <FeatureSnapLabel />},
      },
      ...args,
    );
  }
}
