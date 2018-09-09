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
import {StoreActions, store} from './store';
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
import type {
  UserStatusResponse,
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

/** The parameter prefix used for resources. */
export const RESOURCE_PARAM = 'r=';

/**
 * The dropdown menu for resources.
 *
 * @param props.userStatus the current user status.
 * @param props.resource the current resource descriptor, if any.
 * @param props.setResource the function to set the resource descriptor.
 * @param props.setLoading the function to set the loading state.
 * @param props.pushSearch the function to push a search URL.
 * @param props.replaceSearch the function to replace the search URL.
 */
export class ResourceDropdown extends React.Component<
  {
    userStatus: UserStatusResponse,
    resource: ?ResourceDescriptor,
    setResource: (?ResourceDescriptor) => void,
    setLoading: (Object, boolean) => void,
    pushSearch: string => void,
    replaceSearch: string => void,
  },
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

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
              <SaveItem key="save" resource={this.props.resource} />,
              <RevertItem key="revert" resource={this.props.resource} />,
              <MenuItem
                key="metadata"
                onClick={() =>
                  this._setDialog(
                    <ResourceMetadataDialog
                      resource={this.props.resource}
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
        {this.state.dialog}
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

  _setDialog = (dialog: ?React.Element<any>) => this.setState({dialog});

  _clearDialog = () => this.setState({dialog: null});
}

const SaveItem = ReactRedux.connect(state => ({
  disabled: !state.resourceDirty,
}))((props: {disabled: boolean, resource: ResourceDescriptor}) => (
  <MenuItem
    shortcut={new Shortcut('S', Shortcut.CTRL)}
    disabled={props.disabled}
    onClick={() =>
      store.dispatch(StoreActions.saveResource.create(props.resource.id))
    }>
    <FormattedMessage id="resource.save" defaultMessage="Save" />
  </MenuItem>
));

const RevertItem = ReactRedux.connect(state => ({
  disabled: !state.resourceDirty,
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

    default:
      throw new Error('Unknown resource type: ' + props.type);
  }
}

/**
 * Content for viewing/editing resources.
 *
 * @param props.id the id of the resource to load.
 * @param props.userStatus the current user status.
 * @param props.setLoading the function to set the loading state.
 * @param props.setResource the function to set the resource descriptor.
 */
export class ResourceContent extends React.Component<
  {
    id: string,
    userStatus: UserStatusResponse,
    setLoading: (Object, boolean) => void,
    setResource: (?ResourceDescriptor) => void,
  },
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return <div>{this.state.dialog}</div>;
  }

  async componentDidMount() {
    this.props.setLoading(this, true);
    try {
      const [resource, content] = await Promise.all([
        getFromApi(getResourceMetadataPath(this.props.id)),
        getFromApi(getResourceContentPath(this.props.id)),
      ]);
      this.props.setResource(resource);
      store.dispatch(
        ResourceActions.setResource.create(resource.type, content),
      );
      if (isResourceOwned(resource, this.props.userStatus) && !resource.name) {
        // ask for a name for the new resource
        this._setDialog(
          <ResourceMetadataDialog
            resource={resource}
            required={true}
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

  _setDialog = (dialog: ?React.Element<any>) => this.setState({dialog});

  _clearDialog = () => this.setState({dialog: null});
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

class ResourceMetadataDialogImpl extends React.Component<
  {
    intl: Object,
    resource: ResourceDescriptor,
    required: ?boolean,
    setResource: (?ResourceDescriptor) => void,
    onClosed: () => void,
  },
  {name: string, description: string},
> {
  state = {
    name: renderText(
      <ResourceName resource={this.props.resource} />,
      this.props.intl.locale,
    ),
    description: this.props.resource.description,
  };

  render() {
    const nameValid = isResourceNameValid(this.state.name);
    const descriptionValid = isResourceDescriptionValid(this.state.description);
    return (
      <RequestDialog
        header={
          <FormattedMessage
            id="resource.metadata.title"
            defaultMessage="Resource Metadata"
          />
        }
        makeRequest={this._makeRequest}
        invalid={!(nameValid && descriptionValid)}
        onClosed={this.props.onClosed}
        applicable={!this.props.required}
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
                this.props.intl.locale,
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
    if (
      this.props.resource.name === this.state.name &&
      this.props.resource.description === this.state.description
    ) {
      return {};
    }
    const data = {
      name: this.state.name,
      description: this.state.description,
    };
    await putToApi(getResourceMetadataPath(this.props.resource.id), data);
    this.props.setResource(Object.assign({}, this.props.resource, data));
    return {};
  };
}

const ResourceMetadataDialog = injectIntl(ResourceMetadataDialogImpl);

function getResourceMetadataPath(id: string) {
  return getResourcePath(id) + '/metadata';
}

function getResourceContentPath(id: string) {
  return getResourcePath(id) + '/content';
}

function getResourcePath(id: string) {
  return '/resource/' + id;
}
