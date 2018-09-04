/**
 * Help-related components.
 *
 * @module client/help
 * @flow
 */

import * as React from 'react';
import {FormattedMessage, injectIntl} from 'react-intl';
import {Form, FormGroup, Label, Input} from 'reactstrap';
import {postToApi} from './util/api';
import {
  Menu,
  MenuItem,
  RequestDialog,
  FeedbackDialog,
  renderText,
} from './util/ui';
import type {HelpReportBugRequest} from '../server/api';
import {
  MAX_BUG_DESCRIPTION_LENGTH,
  isBugDescriptionValid,
} from '../server/constants';

/**
 * The dropdown menu for help.
 */
export class HelpDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu label={<FormattedMessage id="help.title" defaultMessage="Help" />}>
        <MenuItem
          onClick={() =>
            this._setDialog(<ReportBugDialog onClosed={this._clearDialog} />)
          }>
          <FormattedMessage
            id="help.report_bug"
            defaultMessage="Report Bug..."
          />
        </MenuItem>
        <MenuItem
          onClick={() =>
            this._setDialog(<AboutDialog onClosed={this._clearDialog} />)
          }>
          <FormattedMessage id="help.about" defaultMessage="About..." />
        </MenuItem>
        {this.state.dialog}
      </Menu>
    );
  }

  _setDialog = (dialog: ?React.Element<any>) => this.setState({dialog});

  _clearDialog = () => this.setState({dialog: null});
}

class ReportBugDialogImpl extends React.Component<
  {intl: Object, onClosed: () => void},
  {description: string},
> {
  state = {description: ''};

  render() {
    const descriptionValid = isBugDescriptionValid(this.state.description);
    return (
      <RequestDialog
        header={
          <FormattedMessage
            id="help.report_bug.title"
            defaultMessage="Report Bug"
          />
        }
        makeRequest={this._makeRequest}
        invalid={!descriptionValid}
        onClosed={this.props.onClosed}
        cancelable>
        <Form>
          <FormGroup>
            <Label for="description">
              <FormattedMessage
                id="bug.description"
                defaultMessage="Description"
              />
            </Label>
            <Input
              type="textarea"
              id="description"
              placeholder={renderText(
                <FormattedMessage
                  id="bug.description.placeholder"
                  defaultMessage={
                    'Please enter a brief description of the problem ' +
                    'and the circumstances under which it happened.'
                  }
                />,
                this.props.intl.locale,
              )}
              value={this.state.description}
              valid={descriptionValid}
              maxLength={MAX_BUG_DESCRIPTION_LENGTH}
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
    const request: HelpReportBugRequest = {
      description: this.state.description,
    };
    return await postToApi('/help/bug', request);
  };
}

const ReportBugDialog = injectIntl(ReportBugDialogImpl);

function AboutDialog(props: {onClosed: () => void}) {
  return (
    <FeedbackDialog
      title={
        <FormattedMessage
          id="help.about.title"
          defaultMessage="About Phantasml"
        />
      }
      onClosed={props.onClosed}>
      <div className="text-center">
        <a href="https://github.com/ey6es/phantasml" target="_blank">
          github.com/ey6es/phantasml
        </a>
      </div>
    </FeedbackDialog>
  );
}
