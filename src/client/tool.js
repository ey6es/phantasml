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
}))((props: {tool: ToolType}) => {
  return (
    <div>
      <Nav tabs className="pt-2 bg-black play-controls" />
      <div className="border-bottom border-secondary text-center pt-3 pb-3">
        <ButtonGroup>
          <SelectPanTool activeTool={props.tool} />
          <RectSelectTool activeTool={props.tool} />
          <TranslateTool activeTool={props.tool} />
          <RotateTool activeTool={props.tool} />
          <ScaleTool activeTool={props.tool} />
          <EraseTool activeTool={props.tool} />
        </ButtonGroup>
      </div>
    </div>
  );
});

class Tool extends React.Component<{activeTool: ToolType}, {}> {
  _type: ToolType;
  _icon: string;
  _name: React.Element<any>;

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
        active={this.props.activeTool === this._type}
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
}

class SelectPanTool extends Tool {
  constructor(...args: any[]) {
    super(
      'selectPan',
      'mouse-pointer',
      <FormattedMessage id="tool.select_pan" defaultMessage="Select/Pan" />,
      ...args,
    );
  }
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
