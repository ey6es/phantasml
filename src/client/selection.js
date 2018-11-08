/**
 * Components related to selection operations.
 *
 * @module client/selection
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Menu, Submenu, MenuItem} from './util/ui';

/**
 * The selection menu dropdown.
 */
export class SelectionDropdown extends React.Component<{}, {}> {
  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="selection.title" defaultMessage="Selection" />
        }>
        <Submenu
          label={
            <FormattedMessage
              id="selection.transform"
              defaultMessage="Transform"
            />
          }>
          <FlipHorizontalItem />
          <FlipVerticalItem />
        </Submenu>
        <ToShapeItem />
        <ToShapeListItem />
        <ToPartsItem />
      </Menu>
    );
  }
}

const FlipHorizontalItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage
      id="transform.flip_horizontal"
      defaultMessage="Flip Horizontal"
    />
  </MenuItem>
));

const FlipVerticalItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage
      id="transform.flip_vertical"
      defaultMessage="Flip Vertical"
    />
  </MenuItem>
));

const ToShapeItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="selection.to_shape" defaultMessage="To Shape" />
  </MenuItem>
));

const ToShapeListItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage
      id="selection.to_shape_list"
      defaultMessage="To Shape List"
    />
  </MenuItem>
));

const ToPartsItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem disabled={props.disabled} onClick={() => {}}>
    <FormattedMessage id="selection.to_parts" defaultMessage="To Parts" />
  </MenuItem>
));
