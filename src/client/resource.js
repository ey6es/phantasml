/**
 * Components related to resources.
 *
 * @module client/resource
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {Card, CardBody, CardTitle, CardSubtitle, Button} from 'reactstrap';
import {getFromApi, postToApi} from './util/api';
import {Menu, MenuItem, Submenu, ErrorDialog} from './util/ui';
import type {
  UserStatusResponse,
  ResourceType,
  ResourceDescriptor,
  ResourceCreateRequest,
} from '../server/api';

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
    setLoading: boolean => void,
    pushSearch: string => void,
  },
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="resource.title" defaultMessage="Resource" />
        }>
        {this.props.userStatus.type === 'logged-in' ? (
          <Submenu
            label={<FormattedMessage id="resource.new" defaultMessage="New" />}>
            <MenuItem onClick={() => this._createResource('environment')}>
              <FormattedMessage
                id="resource.environment"
                defaultMessage="Environment"
              />
            </MenuItem>
          </Submenu>
        ) : null}
        {this.state.dialog}
      </Menu>
    );
  }

  async _createResource(type: ResourceType) {
    this.props.setLoading(true);
    try {
      const request: ResourceCreateRequest = {type};
      const response = await postToApi('/resource', request);
      this.props.pushSearch('?' + RESOURCE_PARAM + response.id);
    } catch (error) {
      this.props.setLoading(false);
      this.setState({
        dialog: <ErrorDialog error={error} onClosed={this._clearDialog} />,
      });
    }
  }

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
    setLoading: boolean => void,
    pushSearch: string => void,
  },
  {resources: ?(ResourceDescriptor[]), dialog: ?React.Element<any>},
> {
  state = {resources: null, dialog: null};

  render() {
    return (
      <div>
        {this.state.resources ? (
          <ResourcePage
            resources={this.state.resources}
            userStatus={this.props.userStatus}
            pushSearch={this.props.pushSearch}
          />
        ) : null}
        {this.state.dialog}
      </div>
    );
  }

  async componentDidMount() {
    this.props.setLoading(true);
    try {
      const response = await getFromApi('/resource');
      this.setState({resources: response.resources});
    } catch (error) {
      this.setState({
        dialog: <ErrorDialog error={error} onClosed={this._clearDialog} />,
      });
    } finally {
      this.props.setLoading(false);
    }
  }

  _clearDialog = () => this.setState({dialog: null});
}

class ResourcePage extends React.Component<
  {
    resources: ResourceDescriptor[],
    userStatus: UserStatusResponse,
    pushSearch: string => void,
  },
  {},
> {
  render() {
    return (
      <div>
        {this.props.resources.map(resource => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            userStatus={this.props.userStatus}
            pushSearch={this.props.pushSearch}
          />
        ))}
      </div>
    );
  }
}

function ResourceCard(props: {
  resource: ResourceDescriptor,
  userStatus: UserStatusResponse,
  pushSearch: string => void,
}) {
  return (
    <Card>
      <CardBody>
        <CardTitle>
          <ResourceName resource={props.resource} />
        </CardTitle>
        <CardSubtitle>{props.resource.description}</CardSubtitle>
        <Button
          color="primary"
          onClick={() =>
            props.pushSearch('?' + RESOURCE_PARAM + props.resource.id)
          }>
          <FormattedMessage id="resource.open" defaultMessage="Open" />
        </Button>
      </CardBody>
    </Card>
  );
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
  {id: string, setLoading: (boolean, ?boolean) => void},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return <div>{this.state.dialog}</div>;
  }

  async componentDidMount() {
    this.props.setLoading(true);
    try {
      const response = await getFromApi('/resource/' + this.props.id);
    } catch (error) {
      this.setState({
        dialog: <ErrorDialog error={error} onClosed={this._clearDialog} />,
      });
    } finally {
      this.props.setLoading(false);
    }
  }

  _clearDialog = () => this.setState({dialog: null});
}
