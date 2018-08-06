/**
 * UI utility components.
 *
 * @module client/util/ui
 * @flow
 */

import * as React from 'react';
import type {Element} from 'react';
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
 * @param props.loadState optional function to load the initial dialog state.
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
 * @param props.applicable if true, the dialog can be applied without closing.
 * @param props.cancelable if true, the dialog can be closed without making the
 * request.
 */
export class RequestDialog<T: Object> extends React.Component<
  {
    header: any,
    children?: mixed,
    loadState?: () => Promise<void>,
    makeRequest: () => Promise<T | [T, boolean]>,
    autoRequest?: boolean,
    invalid?: boolean,
    getFeedback?: (T | Error) => ?React.Element<any>,
    seenResult?: ?T | Error,
    onClosed?: (?T) => void,
    applicable?: boolean,
    cancelable?: boolean,
  },
  {open: boolean, loading: boolean, result: ?T | Error},
> {
  state = {open: true, loading: !!this.props.loadState, result: null};

  render() {
    const displayResult =
      this.state.result === this.props.seenResult ? null : this.state.result;
    const resultFeedback =
      (displayResult &&
        (this.props.getFeedback && this.props.getFeedback(displayResult))) ||
      (displayResult instanceof Error ? (
        <ErrorMessage error={displayResult} />
      ) : null);
    return (
      <Modal
        isOpen={this.state.open}
        centered={true}
        toggle={this.state.loading ? null : this._cancel}
        onClosed={this._onClosed}>
        <div className="modal-header">
          <h5 className="modal-title">{this.props.header}</h5>
          {this._cancel ? (
            <button
              type="button"
              className="close"
              disabled={this.state.loading}
              onClick={this._cancel}>
              <span aria-hidden="true">&times;</span>
            </button>
          ) : null}
        </div>
        <ModalBody>
          {this.props.children}
          {resultFeedback ? (
            <div className="text-warning text-center request-error">
              {resultFeedback}
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
          {this.props.applicable ? (
            <ApplyButton
              disabled={this.state.loading || this.props.invalid}
              onClick={this._apply}
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

  async componentDidMount() {
    const loadState = this.props.loadState;
    if (!loadState) {
      return;
    }
    try {
      await loadState();
      this.setState({loading: false});
    } catch (error) {
      this.setState({loading: false, result: error});
    }
  }

  componentDidUpdate() {
    if (this.props.autoRequest && !this.state.loading) {
      this._submit();
    }
  }

  _cancel = this.props.cancelable ? () => this.setState({open: false}) : null;

  _apply = async () => {
    this.setState({loading: true, result: null});
    try {
      const response = await this.props.makeRequest();
      const [result, open] = Array.isArray(response)
        ? (response: any)
        : [response, false];
      this.setState({loading: false, result});
    } catch (error) {
      this.setState({loading: false, result: error});
    }
  };

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
 * A simple dialog to report an error message.
 *
 * @param props.error the error to report.
 * @param props.getErrorMessage an optional function to retrieve the formatted
 * message corresponding to the error.
 * @param props.closeMessage the message to show on the close button ('OK' by
 * default).
 * @param props.onClosed the function to call when the dialog is closed.
 */
export function ErrorDialog(props: {
  error: Error,
  getErrorMessage?: Error => ?React.Element<any>,
  closeMessage?: React.Element<any>,
  onClosed: () => mixed,
}) {
  return (
    <FeedbackDialog
      title={<FormattedMessage id="error.title" defaultMessage="Error" />}
      closeMessage={props.closeMessage}
      onClosed={props.onClosed}>
      <ErrorMessage
        error={props.error}
        getErrorMessage={props.getErrorMessage}
      />
    </FeedbackDialog>
  );
}

/**
 * A simple dialog to report a feedback message.
 *
 * @param props.title the title of the message.
 * @param props.children the contents of the message.
 * @param props.closeMessage the message to show on the close button ('OK' by
 * default).
 * @param props.onClosed the function to call when the dialog is closed.
 */
export class FeedbackDialog extends React.Component<
  {
    title: mixed,
    children: mixed,
    closeMessage?: React.Element<any>,
    onClosed: () => mixed,
  },
  {open: boolean},
> {
  state = {open: true};

  render() {
    return (
      <Modal
        isOpen={this.state.open}
        centered={true}
        onClosed={this.props.onClosed}>
        <ModalHeader>{this.props.title}</ModalHeader>
        <ModalBody>{this.props.children}</ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={() => this.setState({open: false})}>
            {this.props.closeMessage || <OkMessage />}
          </Button>
        </ModalFooter>
      </Modal>
    );
  }
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
 * A generic apply button.
 *
 * @param props properties to pass to the button.
 */
export function ApplyButton(props: Object) {
  return (
    <Button color="primary" {...props}>
      <FormattedMessage id="apply" defaultMessage="Apply" />
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
      <OkMessage />
    </Button>
  );
}

/**
 * Generic OK message.
 */
function OkMessage() {
  return <FormattedMessage id="ok" defaultMessage="OK" />;
}

/**
 * Renders an error message.
 *
 * @param props.error the error to report.
 * @param props.getErrorMessage an optional function to retrieve the formatted
 * message corresponding to the error.
 */
function ErrorMessage(props: {
  error: Error,
  getErrorMessage?: Error => ?React.Element<any>,
}) {
  if (props.getErrorMessage) {
    const message = props.getErrorMessage(props.error);
    if (message) {
      return message;
    }
  }
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
      return (
        <FormattedMessage
          id="error.server"
          defaultMessage="Sorry, an error occurred connecting to the server."
        />
      );
  }
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
