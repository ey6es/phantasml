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
import {StoreActions, store, isResourceDirty} from './store';
import {UserDropdown} from './user';
import {
  RESOURCE_PARAM,
  ResourceDropdown,
  ResourceBrowser,
  ResourceContent,
  ResourceName,
} from './resource';
import {EditDropdown} from './edit';
import {SelectionDropdown} from './selection';
import {ViewDropdown} from './view';
import {EntityDropdown} from './entity';
import {ComponentDropdown} from './component';
import {AdminDropdown} from './admin';
import {AppTitle, HelpDropdown} from './help';
import type {Renderer} from './renderer/util';
import {getFromApi, putToApi} from './util/api';
import {
  MenuBar,
  LoadingSpinner,
  ErrorTitle,
  OkButton,
  renderText,
} from './util/ui';
import type {
  UserStatusResponse,
  UserGetPreferencesResponse,
  UserPutPreferencesRequest,
  ResourceDescriptor,
} from '../server/api';

type InterfaceProps = {
  userStatus: UserStatusResponse,
  setUserStatus: UserStatusResponse => void,
  locale: string,
};

/**
 * The main app interface.
 */
export class Interface extends React.Component<
  InterfaceProps,
  {
    preferences: UserGetPreferencesResponse,
    loading: ?Object,
    transferring: ?Object,
    search: string,
    resource: ?ResourceDescriptor,
    dialog: ?React.Element<any>,
    renderer: ?Renderer,
  },
> {
  state = {
    preferences: {},
    loading: null,
    transferring: null,
    search: location.search,
    resource: null,
    dialog: null,
    renderer: null,
  };

  _preferencesIntervalId: ?IntervalID;

  render() {
    return (
      <div className="interface">
        <WindowTitleSetter
          resource={this.state.resource}
          locale={this.props.locale}
        />
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
              preferences={this.state.preferences}
              resource={this.state.resource}
              setResource={this._setResource}
              setDialog={this._setDialog}
              setLoading={this._setLoading}
              pushSearch={this._pushSearch}
              replaceSearch={this._replaceSearch}
            />
            {this.props.userStatus.type === 'logged-in' ? (
              <EditDropdown
                preferences={this.state.preferences}
                setPreferences={this._setPreferences}
                flushPreferences={this._flushPreferences}
                resource={this.state.resource}
                setDialog={this._setDialog}
                renderer={this.state.renderer}
              />
            ) : null}
            {this.state.resource
              ? [
                  <SelectionDropdown
                    key="selection"
                    locale={this.props.locale}
                  />,
                  <ViewDropdown key="view" renderer={this.state.renderer} />,
                  <EntityDropdown key="entity" locale={this.props.locale} />,
                  <ComponentDropdown key="component" />,
                ]
              : null}
            {this.props.userStatus.admin ? (
              <AdminDropdown
                locale={this.props.locale}
                setDialog={this._setDialog}
              />
            ) : null}
            <HelpDropdown
              setDialog={this._setDialog}
              renderer={this.state.renderer}
            />
          </Nav>
          <Nav className="ml-auto" navbar>
            <TransferSpinner transferring={this.state.transferring} />
            <UserDropdown
              userStatus={this.props.userStatus}
              setUserStatus={this.props.setUserStatus}
              transferring={this.state.transferring}
              setTransferring={this._setTransferring}
              locale={this.props.locale}
              setDialog={this._setDialog}
            />
          </Nav>
        </MenuBar>
        {this.state.dialog}
      </div>
    );
  }

  componentDidMount() {
    window.addEventListener('popstate', this._updateSearch);
    if (this.props.userStatus.type === 'logged-in') {
      this._fetchPreferences();
    }
  }

  componentDidUpdate(prevProps: InterfaceProps) {
    if (
      this.props.userStatus.type === 'logged-in' &&
      (prevProps.userStatus.type === 'anonymous' ||
        this.props.userStatus.userId !== prevProps.userStatus.userId)
    ) {
      this._fetchPreferences();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this._updateSearch);
    this._clearPreferencesInterval();
  }

  async _fetchPreferences() {
    const preferences = await getFromApi('/user/preferences');
    this.setState({preferences});
  }

  _setPreferences = (preferences: UserGetPreferencesResponse) => {
    this.setState({preferences});
    if (this._preferencesIntervalId == null) {
      this._preferencesIntervalId = setInterval(
        this._flushPreferences,
        30 * 1000,
      );
    }
  };

  _flushPreferences = async (preferences: ?UserGetPreferencesResponse) => {
    if (this._preferencesIntervalId == null) {
      return;
    }
    this._clearPreferencesInterval();
    const request: UserPutPreferencesRequest = Object.assign(
      {},
      preferences || this.state.preferences,
    );
    await putToApi('/user/preferences', request);
  };

  _clearPreferencesInterval() {
    if (this._preferencesIntervalId != null) {
      clearInterval(this._preferencesIntervalId);
      this._preferencesIntervalId = null;
    }
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
              locale={this.props.locale}
              userStatus={this.props.userStatus}
              preferences={this.state.preferences}
              setPreferences={this._setPreferences}
              setLoading={this._setLoading}
              resource={this.state.resource}
              setResource={this._setResource}
              renderer={this.state.renderer}
              setRenderer={this._setRenderer}
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

  _setDialog = (dialog: ?React.Element<any>) => this.setState({dialog});

  _setRenderer = (renderer: ?Renderer) => this.setState({renderer});
}

const WindowTitleSetter = ReactRedux.connect(state => ({
  resourceDirty: isResourceDirty(state),
}))(
  (props: {
    resource: ?ResourceDescriptor,
    locale: string,
    resourceDirty: boolean,
  }) => {
    document.title = renderText(
      <WindowTitle
        resource={props.resource}
        resourceDirty={props.resourceDirty}
      />,
      props.locale,
    );
    return null;
  },
);

function WindowTitle(props: {
  resource: ?ResourceDescriptor,
  resourceDirty: boolean,
}) {
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
}

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
