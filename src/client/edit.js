/**
 * Components related to editing.
 *
 * @module client/edit
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {
  DropdownItem,
  Form,
  FormGroup,
  Label,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
} from 'reactstrap';
import {StoreActions, store} from './store';
import {putToApi} from './util/api';
import {Menu, MenuItem, Shortcut, RequestDialog} from './util/ui';
import {getAutoSaveMinutes} from './resource';
import type {
  UserGetPreferencesResponse,
  UserPutPreferencesRequest,
  ResourceDescriptor,
} from '../server/api';

/**
 * The edit menu dropdown.
 */
export class EditDropdown extends React.Component<
  {
    preferences: UserGetPreferencesResponse,
    setPreferences: UserGetPreferencesResponse => void,
    resource: ?ResourceDescriptor,
  },
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
            this._setDialog(
              <PreferencesDialog
                preferences={this.props.preferences}
                setPreferences={this.props.setPreferences}
                onClosed={this._clearDialog}
              />,
            )
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

const AUTO_SAVE_MINUTES_OPTIONS = [0, 1, 5, 15];

class PreferencesDialog extends React.Component<
  {
    preferences: UserGetPreferencesResponse,
    setPreferences: UserGetPreferencesResponse => void,
    onClosed: () => void,
  },
  {autoSaveMinutes: number},
> {
  state = {autoSaveMinutes: getAutoSaveMinutes(this.props.preferences)};

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
        cancelable>
        <Form>
          <FormGroup>
            <Label>
              <FormattedMessage
                id="preferences.autosave"
                defaultMessage="Auto-Save"
              />
            </Label>
            <UncontrolledDropdown>
              <DropdownToggle caret>
                {this._getAutoSaveMessage(this.state.autoSaveMinutes)}
              </DropdownToggle>
              <DropdownMenu>
                {AUTO_SAVE_MINUTES_OPTIONS.map(autoSaveMinutes => (
                  <DropdownItem
                    key={autoSaveMinutes}
                    onClick={() => this.setState({autoSaveMinutes})}>
                    {this._getAutoSaveMessage(autoSaveMinutes)}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </UncontrolledDropdown>
          </FormGroup>
        </Form>
      </RequestDialog>
    );
  }

  _getAutoSaveMessage(autoSaveMinutes: number) {
    return (
      <FormattedMessage
        id="autosave.minutes"
        defaultMessage={`{autoSaveMinutes, plural,
          =0 {Never} one {Every Minute} other {Every # Minutes}}`}
        values={{autoSaveMinutes}}
      />
    );
  }

  _makeRequest = async () => {
    const request: UserPutPreferencesRequest = {
      autoSaveMinutes: this.state.autoSaveMinutes,
    };
    await putToApi('/user/preferences', request);
    this.props.setPreferences((request: any));
    return {};
  };
}
