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
 *
 * @param props.header the contents of the dialog header.
 * @param props.children the contents of the dialog body.
 * @param props.makeRequest the function to use to make the request.  Return
 * [result, true] to keep the dialog open even if the request succeeds.
 * @param props.autoRequest if true, start the request process automatically
 * (don't wait for the user to click OK).
 * @param props.invalid if true, the input is invalid and the request cannot
 * be made.
 * @param props.getFeedback an optional function to generate custom feedback
 * for result/errors.
 * @param props.seenResult the last result seen.  If this is equal to the
 * current result, that result's feedback (if any) will not be rendered.
 * @param props.onClosed an optional function to invoke with the result (if
 * any) when the dialog is completely closed.
 * @param props.cancelable if true, the dialog can be closed without making the
 * request.
 */
export class RequestDialog<T: Object> extends React.Component<
  {
    header: mixed,
    children?: mixed,
    makeRequest: () => Promise<T | [T, boolean]>,
    autoRequest?: boolean,
    invalid?: boolean,
    getFeedback?: (T | Error) => ?React.Element<any>,
    seenResult?: ?T | Error,
    onClosed?: (?T) => void,
    cancelable?: boolean,
  },
  {open: boolean, loading: boolean, result: ?T | Error},
> {
  state = {open: true, loading: false, result: null};

  render() {
    const displayResult =
      this.state.result === this.props.seenResult ? null : this.state.result;
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
          {displayResult ? (
            <div className="text-warning text-center request-error">
              {(this.props.getFeedback &&
                this.props.getFeedback(displayResult)) ||
                (displayResult instanceof Error ? (
                  <ErrorMessage error={displayResult} />
                ) : null)}
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          {this.state.loading ? (
            <div className="flex-grow-1">
              <LoadingSpinner />
            </div>
          ) : null}
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

  componentDidUpdate() {
    if (this.props.autoRequest && !this.state.loading) {
      this._submit();
    }
  }

  _cancel = this.props.cancelable ? () => this.setState({open: false}) : null;

  _submit = async () => {
    this.setState({loading: true, result: null});
    try {
      const response = await this.props.makeRequest();
      const [result, open] = Array.isArray(response)
        ? (response: any)
        : [response, false];
      this.setState({open, loading: false, result});
    } catch (error) {
      this.setState({loading: false, result: error});
    }
  };

  _onClosed = () => {
    this.props.onClosed &&
      this.props.onClosed(
        this.state.result instanceof Error ? null : this.state.result,
      );
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

function ErrorMessage(props: {error: Error}) {
  switch (props.error.message) {
    case 'error.expired':
      return (
        <FormattedMessage
          id="error.expired"
          defaultMessage={
            'Sorry, your session has expired.  Please reload the page.'
          }
        />
      );
    default:
      return <ServerErrorMessage />;
  }
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
