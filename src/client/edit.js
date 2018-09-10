/**
 * Components related to editing.
 *
 * @module client/edit
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {DropdownItem} from 'reactstrap';
import {StoreActions, store} from './store';
import {Menu, MenuItem, Shortcut, RequestDialog} from './util/ui';
import type {ResourceDescriptor} from '../server/api';

/**
 * The edit menu dropdown.
 */
export class EditDropdown extends React.Component<
  {resource: ?ResourceDescriptor},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu label={<FormattedMessage id="edit.title" defaultMessage="Edit" />}>
        {this.props.resource
          ? [
              <UndoItem key="undo" />,
              <RedoItem key="redo" />,
              <DropdownItem key="firstDivider" divider />,
              <CutItem key="cut" />,
              <CopyItem key="copy" />,
              <PasteItem key="paste" />,
              <DeleteItem key="delete" />,
              <DropdownItem key="secondDivider" divider />,
            ]
          : null}
        <MenuItem
          onClick={() =>
            this._setDialog(<PreferencesDialog onClosed={this._clearDialog} />)
          }>
          <FormattedMessage
            id="edit.preferences"
            defaultMessage="Preferences..."
          />
        </MenuItem>
        {this.state.dialog}
      </Menu>
    );
  }

  _setDialog = (dialog: ?React.Element<any>) => this.setState({dialog});

  _clearDialog = () => this.setState({dialog: null});
}

const UndoItem = ReactRedux.connect(state => ({
  disabled: state.undoStack.length === 0,
}))(props => (
  <MenuItem
    shortcut={new Shortcut('Z', Shortcut.CTRL)}
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.undo.create())}>
    <FormattedMessage id="edit.undo" defaultMessage="Undo" />
  </MenuItem>
));

const RedoItem = ReactRedux.connect(state => ({
  disabled: state.redoStack.length === 0,
}))(props => (
  <MenuItem
    shortcut={
      new Shortcut('Y', Shortcut.CTRL, [
        new Shortcut('Z', Shortcut.CTRL | Shortcut.SHIFT),
      ])
    }
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.redo.create())}>
    <FormattedMessage id="edit.redo" defaultMessage="Redo" />
  </MenuItem>
));

const CutItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    shortcut={new Shortcut('X', Shortcut.CTRL)}
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.cut.create())}>
    <FormattedMessage id="edit.cut" defaultMessage="Cut" />
  </MenuItem>
));

const CopyItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    shortcut={new Shortcut('C', Shortcut.CTRL)}
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.copy.create())}>
    <FormattedMessage id="edit.copy" defaultMessage="Copy" />
  </MenuItem>
));

const PasteItem = ReactRedux.connect(state => ({
  disabled: state.clipboard.length === 0,
}))(props => (
  <MenuItem
    shortcut={new Shortcut('V', Shortcut.CTRL)}
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.paste.create())}>
    <FormattedMessage id="edit.paste" defaultMessage="Paste" />
  </MenuItem>
));

const DeleteItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    shortcut={new Shortcut(46)} // Delete
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.delete.create())}>
    <FormattedMessage id="edit.delete" defaultMessage="Delete" />
  </MenuItem>
));

class PreferencesDialog extends React.Component<{onClosed: () => void}, {}> {
  render() {
    return (
      <RequestDialog
        header={
          <FormattedMessage
            id="preferences.title"
            defaultMessage="Preferences"
          />
        }
        makeRequest={this._makeRequest}
        onClosed={this.props.onClosed}
        applicable
        cancelable
      />
    );
  }

  _makeRequest = async () => {
    return {};
  };
}
