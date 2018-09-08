/**
 * Principal interface components.
 *
 * @module client/interface
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {
  NavbarBrand,
  Nav,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from 'reactstrap';
import type {TransferError} from './store';
import {StoreActions, store} from './store';
import {UserDropdown} from './user';
import {
  RESOURCE_PARAM,
  ResourceDropdown,
  ResourceBrowser,
  ResourceContent,
  ResourceName,
} from './resource';
import {EditDropdown} from './edit';
import {ViewDropdown} from './view';
import {EntityDropdown} from './entity';
import {ComponentDropdown} from './component';
import {AdminDropdown} from './admin';
import {AppTitle, HelpDropdown} from './help';
import {
  MenuBar,
  LoadingSpinner,
  ErrorTitle,
  OkButton,
  renderText,
} from './util/ui';
import type {UserStatusResponse, ResourceDescriptor} from '../server/api';

/**
 * The main app interface.
 */
export class Interface extends React.Component<
  {
    userStatus: UserStatusResponse,
    setUserStatus: UserStatusResponse => void,
    locale: string,
  },
  {
    loading: ?Object,
    transferring: ?Object,
    search: string,
    resource: ?ResourceDescriptor,
  },
> {
  state = {
    loading: null,
    transferring: null,
    search: location.search,
    resource: null,
  };

  render() {
    document.title = renderText(
      <WindowTitle resource={this.state.resource} />,
      this.props.locale,
    );
    return (
      <div className="interface">
        {this._createContent()}
        {this.state.loading ? (
          <div className="full-interface">
            <div className="loading" />
          </div>
        ) : null}
        <TransferErrorDialog />
        <MenuBar
          brand={
            <NavbarBrand onClick={() => this._pushSearch('')}>
              <AppTitle />
            </NavbarBrand>
          }
          disabled={!!this.state.loading}>
          <Nav navbar>
            <ResourceDropdown
              userStatus={this.props.userStatus}
              resource={this.state.resource}
              setResource={this._setResource}
              setLoading={this._setLoading}
              pushSearch={this._pushSearch}
              replaceSearch={this._replaceSearch}
            />
            {this.state.resource
              ? [
                  <EditDropdown key="edit" />,
                  <ViewDropdown key="view" />,
                  <EntityDropdown key="entity" />,
                  <ComponentDropdown key="component" />,
                ]
              : null}
            {this.props.userStatus.admin ? (
              <AdminDropdown locale={this.props.locale} />
            ) : null}
            <HelpDropdown />
          </Nav>
          <Nav className="ml-auto" navbar>
            <TransferSpinner transferring={this.state.transferring} />
            <UserDropdown
              userStatus={this.props.userStatus}
              setUserStatus={this.props.setUserStatus}
              transferring={this.state.transferring}
              setTransferring={this._setTransferring}
              locale={this.props.locale}
            />
          </Nav>
        </MenuBar>
      </div>
    );
  }

  componentDidMount() {
    window.addEventListener('popstate', this._updateSearch);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this._updateSearch);
  }

  _setLoading = (source: Object, loading: boolean) => {
    if (loading) {
      this.setState({loading: source});
    } else if (this.state.loading === source) {
      this.setState({loading: null});
    }
  };

  _setTransferring = (source: Object, transferring: boolean) => {
    if (transferring) {
      this.setState({transferring: source});
    } else if (this.state.transferring === source) {
      this.setState({transferring: null});
    }
  };

  _pushSearch = (search: string) => {
    if (location.search === search) {
      return;
    }
    history.pushState({}, '', search || location.pathname);
    this._updateSearch();
  };

  _replaceSearch = (search: string) => {
    if (location.search === search) {
      return;
    }
    history.replaceState({}, '', search || location.pathname);
    this._updateSearch();
  };

  _updateSearch = () => {
    this.setState({search: location.search});
  };

  _createContent() {
    if (this.state.search.startsWith('?')) {
      for (const param of this.state.search.substring(1).split('&')) {
        if (param.startsWith(RESOURCE_PARAM)) {
          const id = param.substring(RESOURCE_PARAM.length);
          return (
            <ResourceContent
              key={id}
              id={id}
              userStatus={this.props.userStatus}
              setLoading={this._setLoading}
              setResource={this._setResource}
            />
          );
        }
      }
    }
    return (
      <ResourceBrowser
        key={this.props.userStatus.type}
        userStatus={this.props.userStatus}
        setLoading={this._setLoading}
        pushSearch={this._pushSearch}
      />
    );
  }

  _setResource = (resource: ?ResourceDescriptor) => this.setState({resource});
}

const WindowTitle = ReactRedux.connect(state => ({
  resourceDirty: state.resourceDirty,
}))((props: {resource: ?ResourceDescriptor, resourceDirty: boolean}) => {
  if (!props.resource) {
    return <AppTitle />;
  }
  return (
    <FormattedMessage
      id="window.title"
      defaultMessage="{dirty}{resource} - {app}"
      values={{
        dirty: props.resourceDirty ? '*' : '',
        resource: <ResourceName resource={props.resource} />,
        app: <AppTitle />,
      }}
    />
  );
});

const TransferSpinner = ReactRedux.connect((state, ownProps) => ({
  transferring: state.transferAction || ownProps.transferring,
}))((props: {transferring: boolean}) => {
  return props.transferring ? <LoadingSpinner /> : null;
});

class TransferErrorDialogImpl extends React.Component<
  {error: TransferError},
  {open: boolean},
> {
  state = {open: true};

  render() {
    const retryAction = this.props.error.retryAction;
    return (
      <Modal
        isOpen={this.state.open}
        centered={true}
        onClosed={() => {
          store.dispatch(StoreActions.clearTransferError.create());
        }}>
        <ModalHeader>
          <ErrorTitle />
        </ModalHeader>
        <ModalBody>
          <FormattedMessage
            id="transfer.error"
            defaultMessage="Sorry, we experienced an error in data transfer."
          />
        </ModalBody>
        <ModalFooter>
          {retryAction ? (
            <Button
              onClick={() => {
                store.dispatch(retryAction);
                this.setState({open: false});
              }}>
              <FormattedMessage id="transfer.retry" defaultMessage="Retry" />
            </Button>
          ) : null}
          <OkButton onClick={() => this.setState({open: false})} />
        </ModalFooter>
      </Modal>
    );
  }
}

const TransferErrorDialog = ReactRedux.connect(state => ({
  error: state.transferError,
}))((props: {error: ?TransferError}) => {
  return props.error ? <TransferErrorDialogImpl error={props.error} /> : null;
});
