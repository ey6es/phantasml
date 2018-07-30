/**
 * UI utility components.
 *
 * @module client/util/ui
 * @flow
 */

import * as React from 'react';
import {FormattedMessage, injectIntl} from 'react-intl';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  CustomInput,
  NavItem,
  NavLink,
} from 'reactstrap';

/**
 * Base for dialogs that make requests to the server.
 */
export class RequestDialog<T> extends React.Component<
  {
    header: mixed,
    children?: mixed,
    makeRequest: () => Promise<T>,
    invalid?: boolean,
    getErrorMessage?: Error => ?React.Element<FormattedMessage>,
    seenError?: ?Error,
    onClosed: T => void,
    cancelable?: boolean,
  },
  {open: boolean, loading: boolean, error: ?Error},
> {
  state = {open: true, loading: false, error: null};

  _result: T;

  render() {
    const displayError =
      this.state.error === this.props.seenError ? null : this.state.error;
    return (
      <Modal
        isOpen={this.state.open}
        centered={true}
        toggle={this.state.loading ? null : this._cancel}
        onClosed={this._onClosed}>
        <ModalHeader toggle={this.state.loading ? null : this._cancel}>
          {this.props.header}
        </ModalHeader>
        <ModalBody>
          {this.props.children}
          {displayError ? (
            <div className="text-warning text-center request-error">
              {(this.props.getErrorMessage &&
                this.props.getErrorMessage(displayError)) || (
                <ServerErrorMessage />
              )}
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          {this.state.loading ? <LoadingSpinner /> : null}
          {this._cancel ? (
            <CancelButton
              disabled={this.state.loading}
              onClick={this._cancel}
            />
          ) : null}
          <OkButton
            disabled={this.state.loading || this.props.invalid}
            onClick={this._submit}
          />
        </ModalFooter>
      </Modal>
    );
  }

  _cancel = this.props.cancelable ? () => this.setState({open: false}) : null;

  _submit = async () => {
    this.setState({loading: true, error: null});
    try {
      this._result = await this.props.makeRequest();
      this.setState({open: false, loading: false});
    } catch (error) {
      this.setState({loading: false, error});
    }
  };

  _onClosed = () => {
    this.props.onClosed(this._result);
  };
}

/**
 * A small loading spinner.
 */
export function LoadingSpinner() {
  return <div className="loading loading-small" />;
}

/**
 * A generic cancel button.
 *
 * @param props properties to pass to the button.
 */
export function CancelButton(props: Object) {
  return (
    <Button color="secondary" {...props}>
      <FormattedMessage id="cancel" defaultMessage="Cancel" />
    </Button>
  );
}

/**
 * A generic OK button.
 *
 * @param props properties to pass to the button.
 */
export function OkButton(props: Object) {
  return (
    <Button color="primary" {...props}>
      <FormattedMessage id="ok" defaultMessage="OK" />
    </Button>
  );
}

/**
 * A generic server error message.
 */
export function ServerErrorMessage() {
  return (
    <FormattedMessage
      id="error.server"
      defaultMessage="Sorry, an error occurred connecting to the server."
    />
  );
}

/**
 * A checkbox with a translatable label.
 *
 * @param props properties to pass to the input component.
 * @param props.label the label to apply to the checkbox (must be a
 * FormattedMessage).
 */
export const LabeledCheckbox = injectIntl((props: Object) => {
  return (
    <CustomInput
      type="checkbox"
      {...props}
      label={props.intl.formatMessage(
        props.label.props,
        props.label.props.values,
      )}
    />
  );
});
