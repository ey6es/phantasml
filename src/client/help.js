/**
 * Help-related components.
 *
 * @module client/help
 * @flow
 */

import * as React from 'react';
import {FormattedMessage, FormattedDate, injectIntl} from 'react-intl';
import {Form, FormGroup, Label, Input} from 'reactstrap';
import {buildTime, recentLogEntries, postToApi} from './util/api';
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
 * The translatable title of the application.
 */
export function AppTitle(props: {}) {
  return <FormattedMessage id="app.title" defaultMessage="Phantasml" />;
}

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
      userAgent: navigator.userAgent,
      url: location.href,
      buildTime,
      recentLogEntries,
    };
    return await postToApi('/help/bug', request);
  };
}

const ReportBugDialog = injectIntl(ReportBugDialogImpl);

function AboutDialog(props: {onClosed: () => void}) {
  return (
    <FeedbackDialog
      title={<FormattedMessage id="about.title" defaultMessage="About" />}
      onClosed={props.onClosed}>
      <div className="text-center">
        <h1>
          <AppTitle />
        </h1>
      </div>
      <div className="text-center text-muted">
        <FormattedMessage
          id="about.copyright"
          defaultMessage="Copyright &copy; 2018, Andrzej Kapolka"
        />
      </div>
      <div className="text-center pt-3">
        <FormattedMessage
          id="about.build_time"
          defaultMessage="Built at {time}"
          values={{
            time: (
              <FormattedDate
                value={new Date(parseInt(buildTime) * 1000)}
                year="numeric"
                month="numeric"
                day="numeric"
                hour="numeric"
                minute="numeric"
              />
            ),
          }}
        />
      </div>
      <div className="text-center">
        <a href="https://github.com/ey6es/phantasml" target="_blank">
          github.com/ey6es/phantasml
        </a>
      </div>
    </FeedbackDialog>
  );
}
