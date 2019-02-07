/**
 * Components related to editing.
 *
 * @module client/edit
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {DropdownItem, Form} from 'reactstrap';
import type {PropertyData} from './component';
import {PropertyEditorGroup} from './component';
import {StoreActions, store, getPageTranslation} from './store';
import {DEFAULT_AUTO_SAVE_MINUTES} from './resource';
import type {Renderer} from './renderer/util';
import {Menu, MenuItem, Shortcut, RequestDialog} from './util/ui';
import type {
  UserGetPreferencesResponse,
  ResourceDescriptor,
} from '../server/api';
import type {Resource} from '../server/store/resource';
import type {EntityHierarchyNode} from '../server/store/scene';
import {Scene} from '../server/store/scene';
import type {Vector2} from '../server/store/math';

/**
 * The edit menu dropdown.
 */
export class EditDropdown extends React.Component<
  {
    preferences: UserGetPreferencesResponse,
    setPreferences: UserGetPreferencesResponse => void,
    flushPreferences: () => Promise<void>,
    resource: ?ResourceDescriptor,
    setDialog: (?React.Element<any>) => void,
    renderer: ?Renderer,
  },
  {},
> {
  render() {
    return (
      <Menu label={<FormattedMessage id="edit.title" defaultMessage="Edit" />}>
        {this.props.resource
          ? [
              <EditItems
                key="editItems"
                renderer={this.props.renderer}
                shortcuts
              />,
              <DropdownItem key="thirdDivider" divider />,
            ]
          : null}
        <MenuItem
          onClick={() =>
            this._setDialog(
              <PreferencesDialog
                preferences={this.props.preferences}
                setPreferences={this.props.setPreferences}
                flushPreferences={this.props.flushPreferences}
                onClosed={this._clearDialog}
              />,
            )
          }>
          <FormattedMessage
            id="edit.preferences"
            defaultMessage="Preferences..."
          />
        </MenuItem>
      </Menu>
    );
  }

  _setDialog = (dialog: ?React.Element<any>) => this.props.setDialog(dialog);

  _clearDialog = () => this.props.setDialog(null);
}

/**
 * The standard set of edit menu items.
 *
 * @param props the component properties.
 * @param props.shortcuts whether or not to include shortcuts.
 * @param [props.renderer] the renderer reference.
 * @param [props.translation] the translation at which to paste.
 */
export function EditItems(props: {
  shortcuts?: boolean,
  renderer?: ?Renderer,
  translation?: Vector2,
}) {
  return [
    <UndoItem key="undo" shortcut={props.shortcuts} />,
    <RedoItem key="redo" shortcut={props.shortcuts} />,
    <DropdownItem key="firstDivider" divider />,
    <CutItem key="cut" shortcut={props.shortcuts} />,
    <CopyItem key="copy" shortcut={props.shortcuts} />,
    <PasteItem
      key="paste"
      shortcut={props.shortcuts}
      renderer={props.renderer}
      translation={props.translation}
    />,
    <DeleteItem key="delete" shortcut={props.shortcuts} />,
    <DropdownItem key="secondDivider" divider />,
    <SelectAllItem key="selectAll" shortcut={props.shortcuts} />,
  ];
}

const UndoItem = ReactRedux.connect(state => ({
  disabled: state.undoStack.length === 0,
}))((props: {disabled: boolean, shortcut: ?boolean}) => (
  <MenuItem
    shortcut={props.shortcut ? new Shortcut('Z', Shortcut.CTRL) : null}
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.undo.create())}>
    <FormattedMessage id="edit.undo" defaultMessage="Undo" />
  </MenuItem>
));

const RedoItem = ReactRedux.connect(state => ({
  disabled: state.redoStack.length === 0,
}))((props: {disabled: boolean, shortcut: ?boolean}) => (
  <MenuItem
    shortcut={
      props.shortcut
        ? new Shortcut('Y', Shortcut.CTRL, [
            new Shortcut('Z', Shortcut.CTRL | Shortcut.SHIFT),
          ])
        : null
    }
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.redo.create())}>
    <FormattedMessage id="edit.redo" defaultMessage="Redo" />
  </MenuItem>
));

const CutItem = ReactRedux.connect(state => ({
  disabled: !canCopyOrDelete(state.selection),
}))((props: {disabled: boolean, shortcut: ?boolean}) => (
  <MenuItem
    shortcut={
      props.shortcut
        ? new Shortcut('X', Shortcut.CTRL | Shortcut.FIELD_DISABLE)
        : null
    }
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.cut.create())}>
    <FormattedMessage id="edit.cut" defaultMessage="Cut" />
  </MenuItem>
));

const CopyItem = ReactRedux.connect(state => ({
  disabled: !canCopyOrDelete(state.selection),
}))((props: {disabled: boolean, shortcut: ?boolean}) => (
  <MenuItem
    shortcut={
      props.shortcut
        ? new Shortcut('C', Shortcut.CTRL | Shortcut.FIELD_DISABLE)
        : null
    }
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.copy.create())}>
    <FormattedMessage id="edit.copy" defaultMessage="Copy" />
  </MenuItem>
));

const PasteItem = ReactRedux.connect(state => ({
  disabled: state.clipboard.size === 0,
}))(
  (props: {
    disabled: boolean,
    shortcut: ?boolean,
    renderer: ?Renderer,
    translation: ?Vector2,
  }) => (
    <MenuItem
      shortcut={
        props.shortcut
          ? new Shortcut('V', Shortcut.CTRL | Shortcut.FIELD_DISABLE)
          : null
      }
      disabled={props.disabled}
      onClick={() =>
        store.dispatch(
          StoreActions.paste.create(
            props.translation ||
              (props.renderer && props.renderer.mouseWorldPosition) ||
              getPageTranslation(),
          ),
        )
      }>
      <FormattedMessage id="edit.paste" defaultMessage="Paste" />
    </MenuItem>
  ),
);

const DeleteItem = ReactRedux.connect(state => ({
  disabled: !canCopyOrDelete(state.selection),
}))((props: {disabled: boolean, shortcut: ?boolean}) => (
  <MenuItem
    shortcut={props.shortcut ? new Shortcut(46) : null} // Delete
    disabled={props.disabled}
    onClick={() => store.dispatch(StoreActions.delete.create())}>
    <FormattedMessage id="edit.delete" defaultMessage="Delete" />
  </MenuItem>
));

/**
 * Checks whether we can copy or delete the described selection.
 *
 * @param selection the set of selected ids.
 * @return whether or not we can copy or delete the selection.
 */
export function canCopyOrDelete(selection: Set<string>): boolean {
  if (selection.size === 0) {
    return false;
  }
  const resource = store.getState().resource;
  if (resource instanceof Scene) {
    for (const id of selection) {
      if (resource.isInitialEntity(id)) {
        return false;
      }
    }
  }
  return true;
}

const SelectAllItem = ReactRedux.connect(state => {
  let disabled = true;
  const resource = state.resource;
  if (resource instanceof Scene) {
    const pageNode = resource.entityHierarchy.getChild(state.page);
    disabled = !(pageNode && pageNode.children.length > 0);
  }
  return {disabled};
})((props: {disabled: boolean, shortcut: ?boolean}) => (
  <MenuItem
    shortcut={
      props.shortcut
        ? new Shortcut('A', Shortcut.CTRL | Shortcut.FIELD_DISABLE)
        : null
    }
    disabled={props.disabled}
    onClick={() => {
      const state = store.getState();
      const resource = state.resource;
      if (resource instanceof Scene) {
        const pageNode = resource.entityHierarchy.getChild(state.page);
        if (pageNode) {
          const map = {};
          pageNode.applyToEntityIds(id => {
            if (!(id === state.page || resource.isInitialEntity(id))) {
              map[id] = true;
            }
          });
          store.dispatch(StoreActions.select.create(map));
        }
      }
    }}>
    <FormattedMessage id="edit.select_all" defaultMessage="Select All" />
  </MenuItem>
));

const PreferenceProperties: {[string]: PropertyData} = {
  autoSaveMinutes: {
    type: 'select',
    label: (
      <FormattedMessage id="preferences.autosave" defaultMessage="Auto-Save:" />
    ),
    options: [
      {
        label: (
          <FormattedMessage id="autosave.minutes.0" defaultMessage="Never" />
        ),
        value: 0,
      },
      {
        label: (
          <FormattedMessage
            id="autosave.minutes.1"
            defaultMessage="Every Minute"
          />
        ),
        value: 1,
      },
      {
        label: (
          <FormattedMessage
            id="autosave.minutes.5"
            defaultMessage="Every 5 Minutes"
          />
        ),
        value: 5,
      },
      {
        label: (
          <FormattedMessage
            id="autosave.minutes.15"
            defaultMessage="Every 15 Minutes"
          />
        ),
        value: 15,
      },
    ],
    defaultValue: DEFAULT_AUTO_SAVE_MINUTES,
  },
  showStats: {
    type: 'boolean',
    label: (
      <FormattedMessage
        id="preferences.show_stats"
        defaultMessage="Show Stats:"
      />
    ),
  },
};

class PreferencesDialog extends React.Component<
  {
    preferences: UserGetPreferencesResponse,
    setPreferences: UserGetPreferencesResponse => void,
    flushPreferences: (?UserGetPreferencesResponse) => Promise<void>,
    onClosed: () => void,
  },
  {autoSaveMinutes: ?number},
> {
  state = Object.assign({}, this.props.preferences);

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
          <PropertyEditorGroup
            properties={PreferenceProperties}
            type="preferences"
            labelSize={6}
            values={this.state}
            setValue={(key, value) => this.setState({[key]: value})}
            preferences={this.props.preferences}
            setPreferences={this.props.setPreferences}
          />
        </Form>
      </RequestDialog>
    );
  }

  _makeRequest = async () => {
    const preferences = Object.assign({}, this.props.preferences, this.state);
    this.props.setPreferences(preferences);
    await this.props.flushPreferences(preferences);
    return {};
  };
}
