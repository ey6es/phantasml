/**
 * Components related to resources.
 *
 * @module client/resource
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage, injectIntl} from 'react-intl';
import {
  Card,
  CardBody,
  CardTitle,
  CardSubtitle,
  Button,
  Form,
  FormGroup,
  Label,
  Input,
} from 'reactstrap';
import {StoreActions, store, setStoreResource, isResourceDirty} from './store';
import {Toolset} from './tool';
import {EntityTree, EntityMenu} from './entity';
import {SceneView} from './view';
import {ComponentEditor} from './component';
import {getFromApi, deleteFromApi, putToApi, postToApi} from './util/api';
import {
  Menu,
  MenuItem,
  Shortcut,
  Submenu,
  ErrorDialog,
  RequestDialog,
  renderText,
} from './util/ui';
import type {Renderer} from './renderer/util';
import type {
  UserStatusResponse,
  UserGetPreferencesResponse,
  ResourceType,
  ResourceDescriptor,
  ResourceCreateRequest,
} from '../server/api';
import {
  RESOURCE_TYPES,
  MAX_RESOURCE_NAME_LENGTH,
  MAX_RESOURCE_DESCRIPTION_LENGTH,
  isResourceNameValid,
  isResourceDescriptionValid,
} from '../server/constants';
import {ResourceActions} from '../server/store/resource';
import type {Vector2} from '../server/store/math';
import {getValue} from '../server/store/util';

/** The parameter prefix used for resources. */
export const RESOURCE_PARAM = 'r=';

/** The default number of minutes after which to auto-save. */
export const DEFAULT_AUTO_SAVE_MINUTES = 5;

/**
 * Retrieves the auto-save minutes setting from the preferences.
 *
 * @param preferences the preferences object.
 * @return the interval in minutes at which to auto-save, or 0 to disable.
 */
export function getAutoSaveMinutes(
  preferences: UserGetPreferencesResponse,
): number {
  return getValue(preferences.autoSaveMinutes, DEFAULT_AUTO_SAVE_MINUTES);
}

/**
 * The dropdown menu for resources.
 *
 * @param props the element properties.
 * @param props.userStatus the current user status.
 * @param props.resource the current resource descriptor, if any.
 * @param props.setResource the function to set the resource descriptor.
 * @param props.setLoading the function to set the loading state.
 * @param props.pushSearch the function to push a search URL.
 * @param props.replaceSearch the function to replace the search URL.
 */
export class ResourceDropdown extends React.Component<
  {
    locale: string,
    userStatus: UserStatusResponse,
    preferences: UserGetPreferencesResponse,
    resource: ?ResourceDescriptor,
    setResource: (?ResourceDescriptor) => void,
    setLoading: (Object, boolean) => void,
    setDialog: (?React.Element<any>) => void,
    pushSearch: string => void,
    replaceSearch: string => void,
  },
  {},
> {
  render() {
    const resource = this.props.resource;
    return (
      <Menu
        label={
          <FormattedMessage id="resource.title" defaultMessage="Resource" />
        }>
        {this.props.userStatus.type === 'logged-in' ? (
          <Submenu
            label={<FormattedMessage id="resource.new" defaultMessage="New" />}>
            {Object.keys(RESOURCE_TYPES).map(type => (
              <MenuItem key={type} onClick={() => this._createResource(type)}>
                <ResourceTypeMessage type={type} />
              </MenuItem>
            ))}
          </Submenu>
        ) : null}
        {resource && isResourceOwned(resource, this.props.userStatus)
          ? [
              <AutoSaver
                key="autosave"
                preferences={this.props.preferences}
                resource={this.props.resource}
              />,
              <SaveItem key="save" resource={this.props.resource} />,
              <RevertItem key="revert" resource={this.props.resource} />,
              <MenuItem
                key="metadata"
                onClick={() =>
                  this._setDialog(
                    <ResourceMetadataDialog
                      locale={this.props.locale}
                      resource={resource}
                      setResource={this.props.setResource}
                      onClosed={this._clearDialog}
                    />,
                  )
                }>
                <FormattedMessage
                  id="resource.metadata"
                  defaultMessage="Metadata..."
                />
              </MenuItem>,
              <MenuItem
                key="delete"
                onClick={() =>
                  this._setDialog(
                    <DeleteResourceDialog
                      id={resource.id}
                      onClosed={(result: ?{}) => {
                        result && this.props.replaceSearch('');
                        this._clearDialog();
                      }}
                    />,
                  )
                }>
                <DeleteResourceMessage />
              </MenuItem>,
            ]
          : null}
      </Menu>
    );
  }

  async _createResource(type: ResourceType) {
    this.props.setLoading(this, true);
    try {
      const request: ResourceCreateRequest = {type};
      const response = await postToApi('/resource', request);
      this.props.pushSearch('?' + RESOURCE_PARAM + response.id);
    } catch (error) {
      this.props.setLoading(this, false);
      this._setDialog(
        <ErrorDialog error={error} onClosed={this._clearDialog} />,
      );
    }
  }

  _setDialog = (dialog: ?React.Element<any>) => this.props.setDialog(dialog);

  _clearDialog = () => this.props.setDialog(null);
}

type AutoSaverProps = {
  preferences: UserGetPreferencesResponse,
  resource: ResourceDescriptor,
  dirty: boolean,
};

class AutoSaverImpl extends React.Component<AutoSaverProps, {}> {
  _timeoutId: ?TimeoutID;

  render() {
    return null;
  }

  componentDidMount() {
    this._maybeScheduleAutoSave();
  }

  componentDidUpdate(prevProps: AutoSaverProps) {
    if (
      getAutoSaveMinutes(this.props.preferences) !==
        getAutoSaveMinutes(prevProps.preferences) ||
      this.props.resource.id !== prevProps.resource.id ||
      this.props.dirty !== prevProps.dirty
    ) {
      this._maybeClearAutoSave();
      this._maybeScheduleAutoSave();
    }
  }

  componentWillUnmount() {
    this._maybeClearAutoSave();
  }

  _maybeScheduleAutoSave() {
    const autoSaveMinutes = getAutoSaveMinutes(this.props.preferences);
    if (autoSaveMinutes && this.props.dirty) {
      this._timeoutId = setTimeout(this._save, autoSaveMinutes * 60 * 1000);
      window.addEventListener('beforeunload', this._handleBeforeUnload);
    }
  }

  _maybeClearAutoSave() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
      window.removeEventListener('beforeunload', this._handleBeforeUnload);
    }
  }

  _handleBeforeUnload = (event: Event) => {
    // stall the user while we save
    this._save();
    event.preventDefault();
    return '';
  };

  _save = () => {
    store.dispatch(StoreActions.saveResource.create(this.props.resource.id));
  };
}

const AutoSaver = ReactRedux.connect(state => ({
  dirty: isResourceDirty(state),
}))(AutoSaverImpl);

const SaveItem = ReactRedux.connect(state => ({
  disabled: !isResourceDirty(state),
}))((props: {disabled: boolean, resource: ResourceDescriptor}) => (
  <MenuItem
    shortcut={new Shortcut('S', Shortcut.CTRL | Shortcut.DIALOG_ENABLE)}
    disabled={props.disabled}
    onClick={() =>
      store.dispatch(StoreActions.saveResource.create(props.resource.id))
    }>
    <FormattedMessage id="resource.save" defaultMessage="Save" />
  </MenuItem>
));

const RevertItem = ReactRedux.connect(state => ({
  disabled: !isResourceDirty(state),
}))((props: {disabled: boolean, resource: ResourceDescriptor}) => (
  <MenuItem
    disabled={props.disabled}
    onClick={() =>
      store.dispatch(StoreActions.loadResource.create(props.resource.id))
    }>
    <FormattedMessage id="resource.revert" defaultMessage="Revert" />
  </MenuItem>
));

/**
 * Content for browsing available resources.
 *
 * @param props the element properties.
 * @param props.userStatus the current user status.
 * @param props.setLoading the function to set the loading state.
 * @param props.pushSearch the function to push a search URL.
 */
export class ResourceBrowser extends React.Component<
  {
    userStatus: UserStatusResponse,
    setLoading: (Object, boolean) => void,
    pushSearch: string => void,
  },
  {resources: ?(ResourceDescriptor[]), dialog: ?React.Element<any>},
> {
  state = {resources: null, dialog: null};

  render() {
    return (
      <div className="p-3">
        {this.state.resources ? (
          <ResourcePage
            resources={this.state.resources}
            userStatus={this.props.userStatus}
            pushSearch={this.props.pushSearch}
            setDialog={this._setDialog}
          />
        ) : null}
        {this.state.dialog}
      </div>
    );
  }

  async componentDidMount() {
    this.props.setLoading(this, true);
    try {
      const response = await getFromApi('/resource');
      this.setState({resources: response.resources});
    } catch (error) {
      this._setDialog(
        <ErrorDialog error={error} onClosed={this._clearDialog} />,
      );
    } finally {
      this.props.setLoading(this, false);
    }
  }

  _setDialog = (dialog: ?React.Element<any>) => this.setState({dialog});

  _clearDialog = () => this.setState({dialog: null});
}

class ResourcePage extends React.Component<
  {
    resources: ResourceDescriptor[],
    userStatus: UserStatusResponse,
    setDialog: (?React.Element<any>) => void,
    pushSearch: string => void,
  },
  {resources: ResourceDescriptor[]},
> {
  state = {resources: this.props.resources};

  render() {
    return (
      <div>
        {this.state.resources.map(resource => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            userStatus={this.props.userStatus}
            openResource={this._openResource}
            deleteResource={this._deleteResource}
          />
        ))}
      </div>
    );
  }

  _openResource = (id: string) => {
    this.props.pushSearch('?' + RESOURCE_PARAM + id);
  };

  _deleteResource = (id: string) => {
    this.props.setDialog(
      <DeleteResourceDialog
        id={id}
        onClosed={(result: ?{}) => {
          if (result) {
            this.setState({
              resources: this.state.resources.filter(
                resource => resource.id !== id,
              ),
            });
          }
          this.props.setDialog(null);
        }}
      />,
    );
  };
}

function DeleteResourceDialog(props: {id: string, onClosed: (?{}) => void}) {
  return (
    <RequestDialog
      header={
        <FormattedMessage
          id="resource.delete.title"
          defaultMessage="Confirm Deletion"
        />
      }
      makeRequest={async () => {
        return await deleteFromApi(getResourcePath(props.id));
      }}
      onClosed={props.onClosed}
      cancelable>
      <FormattedMessage
        id="resource.delete.content"
        defaultMessage="Are you sure you want to delete this resource?"
      />
    </RequestDialog>
  );
}

function ResourceCard(props: {
  resource: ResourceDescriptor,
  userStatus: UserStatusResponse,
  openResource: string => void,
  deleteResource: string => void,
}) {
  return (
    <div className="d-inline-block p-3">
      <Card>
        <CardBody>
          <CardTitle>
            <ResourceName resource={props.resource} />
          </CardTitle>
          <CardSubtitle>{props.resource.description}</CardSubtitle>
          {isResourceOwned(props.resource, props.userStatus) ? (
            <Button
              color="secondary"
              onClick={() => props.deleteResource(props.resource.id)}>
              <DeleteResourceMessage />
            </Button>
          ) : null}
          <Button
            className="float-right"
            color="primary"
            onClick={() => props.openResource(props.resource.id)}>
            <FormattedMessage id="resource.open" defaultMessage="Open" />
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function DeleteResourceMessage(props: {}) {
  return <FormattedMessage id="resource.delete" defaultMessage="Delete" />;
}

/**
 * A translatable message for the name of a resource.
 *
 * @param props the element properties.
 * @param props.resource the resource descriptor.
 * @return the resource name message.
 */
export function ResourceName(props: {resource: ResourceDescriptor}) {
  if (props.resource.name) {
    return props.resource.name;
  }
  return (
    <FormattedMessage
      id="resource.name.untitled"
      defaultMessage="Untitled {type}"
      values={{type: <ResourceTypeMessage type={props.resource.type} />}}
    />
  );
}

/**
 * Returns the formatted message identifying the specified resource type.
 *
 * @param props the element properties.
 * @param props.type the type to label.
 * @return the formatted message.
 */
export function ResourceTypeMessage(props: {type: ResourceType}) {
  switch (props.type) {
    case 'environment':
      return (
        <FormattedMessage
          id="resource.type.environment"
          defaultMessage="Environment"
        />
      );
    case 'construct':
      return (
        <FormattedMessage
          id="resource.type.construct"
          defaultMessage="Construct"
        />
      );
    default:
      throw new Error('Unknown resource type: ' + props.type);
  }
}

/**
 * Content for viewing/editing resources.
 *
 * @param props the element properties.
 * @param props.id the id of the resource to load.
 * @param props.locale the current locale.
 * @param props.userStatus the current user status.
 * @param props.setLoading the function to set the loading state.
 * @param props.setResource the function to set the resource descriptor.
 */
export class ResourceContent extends React.Component<
  {
    id: string,
    locale: string,
    userStatus: UserStatusResponse,
    preferences: UserGetPreferencesResponse,
    setPreferences: UserGetPreferencesResponse => void,
    setLoading: (Object, boolean) => void,
    resource: ?ResourceDescriptor,
    setResource: (?ResourceDescriptor) => void,
    renderer: ?Renderer,
    setRenderer: (?Renderer) => void,
  },
  {
    dialog: ?React.Element<any>,
    fontImage: ?HTMLImageElement,
    entityMenuPosition: ?Vector2,
    mousePositionElement: ?HTMLElement,
  },
> {
  state = {
    dialog: null,
    fontImage: null,
    entityMenuPosition: null,
    mousePositionElement: null,
  };

  _fontImage: Promise<HTMLImageElement> = new Promise(
    resolve => (this._resolveFontImage = resolve),
  );
  _resolveFontImage: HTMLImageElement => void;

  render() {
    return (
      <div>
        {this.props.resource && this.state.fontImage
          ? this._createLayout(this.props.resource, this.state.fontImage)
          : null}
        {this.state.dialog}
        <img
          ref={image => {
            if (image) {
              image.addEventListener('load', () =>
                this._resolveFontImage(image),
              );
            }
          }}
          className="invisible"
          src="Lato-Regular.png"
        />
      </div>
    );
  }

  async componentDidMount() {
    this.props.setLoading(this, true);
    try {
      const [resource, content, fontImage] = await Promise.all([
        getFromApi(getResourceMetadataPath(this.props.id)),
        getFromApi(getResourceContentPath(this.props.id)),
        this._fontImage,
      ]);
      this.setState({fontImage});
      this.props.setResource(resource);
      setStoreResource(resource.type, content);
      if (isResourceOwned(resource, this.props.userStatus) && !resource.name) {
        // ask for a name for the new resource
        this._setDialog(
          <ResourceMetadataDialog
            locale={this.props.locale}
            resource={resource}
            required
            setResource={this.props.setResource}
            onClosed={this._clearDialog}
          />,
        );
      }
    } catch (error) {
      this.setState({
        dialog: <ErrorDialog error={error} onClosed={this._clearDialog} />,
      });
    } finally {
      this.props.setLoading(this, false);
    }
  }

  componentWillUnmount() {
    store.dispatch(ResourceActions.clearResource.create());
    this.props.setResource(null);
  }

  _createLayout(resource: ResourceDescriptor, fontImage: HTMLImageElement) {
    switch (resource.type) {
      case 'environment':
      case 'construct':
        return (
          <div className="full-interface d-flex">
            <div className="d-flex flex-column left-column">
              <Toolset
                locale={this.props.locale}
                preferences={this.props.preferences}
                setPreferences={this.props.setPreferences}
                renderer={this.props.renderer}
                mousePositionElement={this.state.mousePositionElement}
                entityMenuPosition={this.state.entityMenuPosition}
                openEntityMenu={this._openEntityMenu}
              />
              <EntityTree
                renderer={this.props.renderer}
                openEntityMenu={this._openEntityMenu}
              />
            </div>
            <div className="flex-grow-1 d-flex flex-column">
              <SceneView
                locale={this.props.locale}
                preferences={this.props.preferences}
                setRenderer={this.props.setRenderer}
                setMousePositionElement={this._setMousePositionElement}
                fontImage={fontImage}
              />
            </div>
            <div className="d-flex flex-column right-column">
              <ComponentEditor
                locale={this.props.locale}
                preferences={this.props.preferences}
                setPreferences={this.props.setPreferences}
              />
            </div>
            {this.state.entityMenuPosition ? (
              <EntityMenu
                locale={this.props.locale}
                renderer={this.props.renderer}
                position={this.state.entityMenuPosition}
                close={this._closeEntityMenu}
              />
            ) : null}
          </div>
        );
      default:
        throw new Error('Unknown resource type: ' + resource.type);
    }
  }

  _setDialog = (dialog: ?React.Element<any>) => this.setState({dialog});

  _clearDialog = () => this.setState({dialog: null});

  _openEntityMenu = (position: Vector2) => {
    this.setState({entityMenuPosition: position});
  };

  _closeEntityMenu = () => this.setState({entityMenuPosition: null});

  _setMousePositionElement = (mousePositionElement: ?HTMLElement) => {
    this.setState({mousePositionElement});
  };
}

function isResourceOwned(
  resource: ?ResourceDescriptor,
  userStatus: UserStatusResponse,
): boolean {
  if (!resource || userStatus.type === 'anonymous') {
    return false;
  }
  return userStatus.admin || resource.ownerId === userStatus.userId;
}

/**
 * Dialog for configuring resource metadata.
 *
 * @param props the component properties.
 * @param props.locale the current locale.
 * @param resource the resource descriptor.
 * @param required whether or not the metadata is required.
 * @param setResource the function to call when the metadata is set.
 * @param onClosed the function to call when closed.
 */
export class ResourceMetadataDialog extends React.Component<
  {
    locale: string,
    resource: ResourceDescriptor,
    required?: boolean,
    setResource: (?ResourceDescriptor) => void,
    onClosed: () => void,
  },
  {name: string, description: string},
> {
  state = {
    name: renderText(
      <ResourceName resource={this.props.resource} />,
      this.props.locale,
    ),
    description: this.props.resource.description,
  };

  get _header() {
    return (
      <FormattedMessage
        id="resource.metadata.title"
        defaultMessage="Resource Metadata"
      />
    );
  }

  get _applicable(): boolean {
    return !this.props.required;
  }

  render() {
    const nameValid = isResourceNameValid(this.state.name);
    const descriptionValid = isResourceDescriptionValid(this.state.description);
    return (
      <RequestDialog
        header={this._header}
        makeRequest={this._makeRequest}
        invalid={!(nameValid && descriptionValid)}
        onClosed={this.props.onClosed}
        applicable={this._applicable}
        cancelable={!this.props.required}>
        <Form>
          <FormGroup>
            <Label for="name">
              <FormattedMessage id="resource.name" defaultMessage="Name" />
            </Label>
            <Input
              id="name"
              value={this.state.name}
              valid={nameValid}
              maxLength={MAX_RESOURCE_NAME_LENGTH}
              onChange={event => this.setState({name: event.target.value})}
            />
          </FormGroup>
          <FormGroup>
            <Label for="description">
              <FormattedMessage
                id="resource.description"
                defaultMessage="Description"
              />
            </Label>
            <Input
              type="textarea"
              id="description"
              placeholder={renderText(
                <FormattedMessage
                  id="resource.description.placeholder"
                  defaultMessage="An optional description of the resource."
                />,
                this.props.locale,
              )}
              value={this.state.description}
              valid={descriptionValid}
              maxLength={MAX_RESOURCE_DESCRIPTION_LENGTH}
              onChange={event =>
                this.setState({description: event.target.value})
              }
            />
          </FormGroup>
        </Form>
      </RequestDialog>
    );
  }

  _makeRequest = async () => {
    await this._submitRequest();
    return {};
  };

  async _submitRequest(): Promise<void> {
    if (
      this.props.resource.name === this.state.name &&
      this.props.resource.description === this.state.description
    ) {
      return;
    }
    const data = {
      name: this.state.name,
      description: this.state.description,
    };
    await putToApi(getResourceMetadataPath(this.props.resource.id), data);
    this.props.setResource(Object.assign({}, this.props.resource, data));
  }
}

/**
 * Returns the metadata path for the resource with the given id.
 *
 * @param id the id of the resource.
 * @return the metadata path.
 */
export function getResourceMetadataPath(id: string) {
  return getResourcePath(id) + '/metadata';
}

/**
 * Returns the content path for the resource with the given id.
 *
 * @param id the id of the resource.
 * @return the content path.
 */
export function getResourceContentPath(id: string) {
  return getResourcePath(id) + '/content';
}

function getResourcePath(id: string) {
  return '/resource/' + id;
}
