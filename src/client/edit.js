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
import {Menu, MenuItem} from './util/ui';

/**
 * The edit menu dropdown.
 */
export class EditDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu label={<FormattedMessage id="edit.title" defaultMessage="Edit" />}>
        <UndoItem />
        <RedoItem />
        <DropdownItem divider />
        <CutItem />
        <CopyItem />
        <PasteItem />
        <DeleteItem />
        {this.state.dialog}
      </Menu>
    );
  }
}

const UndoItem = ReactRedux.connect(state => ({
  disabled: state.undoStack.length === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.undo.create())}>
    <FormattedMessage id="edit.undo" defaultMessage="Undo" />
  </MenuItem>
));

const RedoItem = ReactRedux.connect(state => ({
  disabled: state.redoStack.length === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.redo.create())}>
    <FormattedMessage id="edit.redo" defaultMessage="Redo" />
  </MenuItem>
));

const CutItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.cut.create())}>
    <FormattedMessage id="edit.cut" defaultMessage="Cut" />
  </MenuItem>
));

const CopyItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.copy.create())}>
    <FormattedMessage id="edit.copy" defaultMessage="Copy" />
  </MenuItem>
));

const PasteItem = ReactRedux.connect(state => ({
  disabled: state.clipboard.length === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.paste.create())}>
    <FormattedMessage id="edit.paste" defaultMessage="Paste" />
  </MenuItem>
));

const DeleteItem = ReactRedux.connect(state => ({
  disabled: state.selection.size === 0,
}))(props => (
  <MenuItem
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.delete.create())}>
    <FormattedMessage id="edit.delete" defaultMessage="Delete" />
  </MenuItem>
));
