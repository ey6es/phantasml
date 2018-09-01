/**
 * Components related to resources.
 *
 * @module client/resource
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Card, CardBody, CardTitle, CardSubtitle, Button} from 'reactstrap';
import {getFromApi, deleteFromApi, postToApi} from './util/api';
import {Menu, MenuItem, Submenu, ErrorDialog, RequestDialog} from './util/ui';
import type {
  UserStatusResponse,
  ResourceType,
  ResourceDescriptor,
  ResourceCreateRequest,
} from '../server/api';
import {RESOURCE_TYPES} from '../server/constants';

/** The parameter prefix used for resources. */
export const RESOURCE_PARAM = 'r=';

/**
 * The dropdown menu for resources.
 *
 * @param props.setLoading the function to set the loading state.
 */
export class ResourceDropdown extends React.Component<
  {
    userStatus: UserStatusResponse,
    resource: ?ResourceDescriptor,
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
              <MenuItem onClick={() => this._createResource(type)}>
                <ResourceTypeMessage type={type} />
              </MenuItem>
            ))}
          </Submenu>
        ) : null}
        {resource && isResourceOwned(resource, this.props.userStatus) ? (
          <MenuItem
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
          </MenuItem>
        ) : null}
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

/**
 * Content for browsing available resources.
 *
 * @param props.setLoading the function to set the loading state.
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
        return await deleteFromApi('/resource/' + props.id);
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

function isResourceOwned(
  resource: ?ResourceDescriptor,
  userStatus: UserStatusResponse,
): boolean {
  if (!resource || userStatus.type === 'anonymous') {
    return false;
  }
  return userStatus.admin || resource.ownerId === userStatus.userId;
}

function ResourceName(props: {resource: ResourceDescriptor}) {
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
 * @param props.setLoading the function to set the loading state.
 */
export class ResourceContent extends React.Component<
  {
    id: string,
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
      this.props.setResource(await getFromApi('/resource/' + this.props.id));
    } catch (error) {
      this.setState({
        dialog: <ErrorDialog error={error} onClosed={this._clearDialog} />,
      });
    } finally {
      this.props.setLoading(this, false);
    }
  }

  componentWillUnmount() {
    this.props.setResource(null);
  }

  _clearDialog = () => this.setState({dialog: null});
}
