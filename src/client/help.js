/**
 * Help-related components.
 *
 * @module client/help
 * @flow
 */

import * as React from 'react';
import {FormattedMessage, FormattedDate, injectIntl} from 'react-intl';
import {Form, FormGroup, Label, Input} from 'reactstrap';
import type {Renderer} from './renderer/util';
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
  {setDialog: (?React.Element<any>) => void, renderer: ?Renderer},
  {},
> {
  render() {
    return (
      <Menu label={<FormattedMessage id="help.title" defaultMessage="Help" />}>
        <MenuItem
          onClick={() =>
            this._setDialog(
              <ReportBugDialog
                renderer={this.props.renderer}
                onClosed={this._clearDialog}
              />,
            )
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
      </Menu>
    );
  }

  _setDialog = (dialog: ?React.Element<any>) => this.props.setDialog(dialog);

  _clearDialog = () => this.props.setDialog(null);
}

class ReportBugDialogImpl extends React.Component<
  {intl: Object, renderer: ?Renderer, onClosed: () => void},
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
    // get the screenshot if we have a renderer
    const renderer = this.props.renderer;
    let stats: ?{[string]: number};
    let screenshot: ?string;
    if (renderer) {
      stats = {
        framesPerSecond: Math.round(renderer.framesPerSecond),
        arrayBuffers: renderer.arrayBuffers.size,
        elementArrayBuffers: renderer.elementArrayBuffers.size,
        vertexShaders: renderer.vertexShaders.size,
        fragmentShaders: renderer.fragmentShaders.size,
        programs: renderer.programs.size,
        textures: renderer.textures.size,
        framebuffers: renderer.framebuffers.size,
      };
      screenshot = await new Promise(resolve => {
        const callback = renderer => {
          resolve(renderer.canvas.toDataURL());
          renderer.removeRenderCallback(callback);
        };
        renderer.addRenderCallback(callback, Infinity);
        renderer.requestFrameRender();
      });
    }
    const request: HelpReportBugRequest = {
      description: this.state.description,
      userAgent: navigator.userAgent,
      url: location.href,
      buildTime,
      recentLogEntries,
      stats,
      screenshot,
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
          defaultMessage="Copyright &copy; 2018-2019, Andrzej Kapolka"
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
