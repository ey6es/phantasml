/**
 * Components related to tools.
 *
 * @module client/tool
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Nav, Button, ButtonGroup, UncontrolledTooltip} from 'reactstrap';
import {library} from '@fortawesome/fontawesome-svg-core';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faMousePointer} from '@fortawesome/free-solid-svg-icons/faMousePointer';
import {faExpand} from '@fortawesome/free-solid-svg-icons/faExpand';
import {faArrowsAlt} from '@fortawesome/free-solid-svg-icons/faArrowsAlt';
import {faSync} from '@fortawesome/free-solid-svg-icons/faSync';
import {faCompress} from '@fortawesome/free-solid-svg-icons/faCompress';
import {faEraser} from '@fortawesome/free-solid-svg-icons/faEraser';
import type {ToolType} from './store';
import {StoreActions, store} from './store';
import type {Renderer} from './renderer/util';

library.add(faMousePointer);
library.add(faExpand);
library.add(faArrowsAlt);
library.add(faSync);
library.add(faCompress);
library.add(faEraser);

/**
 * The set of tools available.
 */
export const Toolset = ReactRedux.connect(state => ({
  tool: state.tool,
}))((props: {tool: ToolType, renderer: ?Renderer}) => {
  return (
    <div>
      <Nav tabs className="pt-2 bg-black play-controls" />
      <div className="border-bottom border-secondary text-center pt-3 pb-3">
        <ButtonGroup>
          <SelectPanTool activeTool={props.tool} renderer={props.renderer} />
          <RectSelectTool activeTool={props.tool} renderer={props.renderer} />
          <TranslateTool activeTool={props.tool} renderer={props.renderer} />
          <RotateTool activeTool={props.tool} renderer={props.renderer} />
          <ScaleTool activeTool={props.tool} renderer={props.renderer} />
          <EraseTool activeTool={props.tool} renderer={props.renderer} />
        </ButtonGroup>
      </div>
    </div>
  );
});

type ToolProps = {activeTool: ToolType, renderer: ?Renderer};

class Tool extends React.Component<ToolProps, {}> {
  _type: ToolType;
  _icon: string;
  _name: React.Element<any>;

  /** Checks whether the tool is active. */
  get active(): boolean {
    return this.props.activeTool === this._type;
  }

  constructor(
    type: ToolType,
    icon: string,
    name: React.Element<any>,
    ...args: any[]
  ) {
    super(...args);
    this._type = type;
    this._icon = icon;
    this._name = name;
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

  componentDidUpdate(prevProps: ToolProps) {
    if (prevProps.renderer !== this.props.renderer) {
      prevProps.renderer && this._unsubscribeFromRenderer(prevProps.renderer);
      this.props.renderer && this._subscribeToRenderer(this.props.renderer);
    }
  }

  _subscribeToRenderer(renderer: Renderer) {
    renderer.canvas.addEventListener('mousedown', this._onMouseDown);
    renderer.canvas.addEventListener('mouseup', this._onMouseUp);
    renderer.canvas.addEventListener('mousemove', this._onMouseMove);
    renderer.canvas.addEventListener('wheel', this._onWheel);
  }

  _unsubscribeFromRenderer(renderer: Renderer) {
    renderer.canvas.removeEventListener('mousedown', this._onMouseDown);
    renderer.canvas.removeEventListener('mouseup', this._onMouseUp);
    renderer.canvas.removeEventListener('mousemove', this._onMouseMove);
    renderer.canvas.removeEventListener('wheel', this._onWheel);
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

class SelectPanTool extends Tool {
  _panning = false;

  constructor(...args: any[]) {
    super(
      'selectPan',
      'mouse-pointer',
      <FormattedMessage id="tool.select_pan" defaultMessage="Select/Pan" />,
      ...args,
    );
  }

  _onMouseDown = (event: MouseEvent) => {
    if (this.active && event.button === 0) {
      (event.target: any).style.cursor = 'all-scroll';
      this._panning = true;
    }
  };

  _onMouseUp = (event: MouseEvent) => {
    if (this._panning) {
      (event.target: any).style.cursor = null;
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

class RectSelectTool extends Tool {
  constructor(...args: any[]) {
    super(
      'rectSelect',
      'expand',
      <FormattedMessage id="tool.rect_select" defaultMessage="Rect Select" />,
      ...args,
    );
  }
}

class TranslateTool extends Tool {
  constructor(...args: any[]) {
    super(
      'translate',
      'arrows-alt',
      <FormattedMessage id="tool.translate" defaultMessage="Translate" />,
      ...args,
    );
  }
}

class RotateTool extends Tool {
  constructor(...args: any[]) {
    super(
      'rotate',
      'sync',
      <FormattedMessage id="tool.rotate" defaultMessage="Rotate" />,
      ...args,
    );
  }
}

class ScaleTool extends Tool {
  constructor(...args: any[]) {
    super(
      'scale',
      'compress',
      <FormattedMessage id="tool.scale" defaultMessage="Scale" />,
      ...args,
    );
  }
}

class EraseTool extends Tool {
  constructor(...args: any[]) {
    super(
      'erase',
      'eraser',
      <FormattedMessage id="tool.erase" defaultMessage="Erase" />,
      ...args,
    );
  }
}
