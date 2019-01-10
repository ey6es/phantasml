/**
 * UI utility components.
 *
 * @module client/util/ui
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import * as ReactDOM from 'react-dom';
import * as ReactDOMServer from 'react-dom/server';
import type {Element} from 'react';
import {IntlProvider, FormattedMessage, injectIntl} from 'react-intl';
import {Target} from 'react-popper';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  CustomInput,
  Navbar,
  NavbarToggler,
  Collapse,
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Input,
  InputGroup,
  InputGroupAddon,
} from 'reactstrap';
import {library} from '@fortawesome/fontawesome-svg-core';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faEllipsisV} from '@fortawesome/free-solid-svg-icons/faEllipsisV';
import type {Vector2} from '../../server/store/math';
import {roundToPrecision} from '../../server/store/math';
import {store} from '../store';

library.add(faEllipsisV);

/** The standard tooltip delay in milliseconds. */
export const TOOLTIP_DELAY = 750;

/**
 * Base for dialogs that make requests to the server.
 *
 * @param props the element properties.
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
    onClosed?: (?T) => void,
    applicable?: boolean,
    cancelable?: boolean,
  },
  {open: boolean, loading: boolean, result: ?T | Error},
> {
  state = {open: true, loading: !!this.props.loadState, result: null};

  _renderedResult: ?T | Error;

  render() {
    const displayResult = this.state.result;
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
    if (this.state.result) {
      // the first time we see the result, we render it.
      // the next time, we clear it out (assuming that some other state
      // update means the user has seen it)
      if (this.state.result !== this._renderedResult) {
        this._renderedResult = this.state.result;
      } else {
        this._renderedResult = null;
        this.setState({result: null});
      }
    }
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
 * @param props the element properties.
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
      title={<ErrorTitle />}
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
 * The title of the error dialog.
 */
export function ErrorTitle() {
  return <FormattedMessage id="error.title" defaultMessage="Error" />;
}

/**
 * A simple dialog to report a feedback message.
 *
 * @param props the element properties.
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
 * @param props the element properties.
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
    case 'error.resource':
      return (
        <FormattedMessage
          id="error.resource"
          defaultMessage="Sorry, this resource has been deleted."
        />
      );
    default:
      console.warn(props.error);
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
 * @param props the element properties.
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

const dummyComponent = {props: {}, state: {}, setState: state => undefined};
const MenuBarContext = React.createContext(dummyComponent);

/**
 * A menu bar.
 *
 * @param props the element properties.
 * @param props.disabled if true, disable all menus on the bar.
 * @param props.brand the contents of the brand section.
 * @param props.children the bar contents.
 */
export class MenuBar extends React.Component<
  {disabled?: ?boolean, brand?: mixed, children?: mixed},
  {open: boolean, active: boolean, hoverItem: ?React.Component<any, any>},
> {
  state = {open: false, active: false, hoverItem: null};

  render() {
    return (
      <Navbar className="menu-bar" color="primary" dark expand="md">
        {this.props.brand}
        <NavbarToggler onClick={this._toggle} />
        <Collapse isOpen={this.state.open} navbar>
          <MenuBarContext.Provider value={this}>
            {this.props.children}
          </MenuBarContext.Provider>
        </Collapse>
      </Navbar>
    );
  }

  _toggle = () => this.setState({open: !this.state.open});
}

const MenuContext = React.createContext(dummyComponent);

const menuContainer = document.createElement('DIV');
menuContainer.className = 'menu-container';
(document.body: any).appendChild(menuContainer);

class ContainedDropdown extends Dropdown {
  getContainer() {
    return menuContainer;
  }
}

/**
 * A dropdown menu with submenu support.
 *
 * @param props the element properties.
 * @param props.label the menu label.
 * @param props.disabled whether or not the menu is disabled.
 * @param props.children the menu contents.
 * @param props.omitChildrenWhenClosed if true, don't render the children when
 * the menu is closed (as an optimization).
 */
export class Menu extends React.Component<
  {
    label: React.Element<any>,
    disabled?: ?boolean,
    children?: mixed,
    omitChildrenWhenClosed?: boolean,
  },
  {hoverItem: ?React.Component<any, any>},
> {
  state = {hoverItem: null};

  render() {
    return (
      <MenuBarContext.Consumer>
        {menuBar => {
          const open = menuBar.state.active && menuBar.state.hoverItem === this;
          return (
            <ContainedDropdown
              nav
              onMouseOver={event => menuBar.setState({hoverItem: this})}
              isOpen={open}
              toggle={() => menuBar.setState({active: !menuBar.state.active})}>
              <div>
                <DropdownToggle
                  disabled={menuBar.props.disabled || this.props.disabled}
                  nav
                  caret
                  onMouseOver={event =>
                    menuBar.state.active && event.target.focus()
                  }
                  onDragStart={event => event.preventDefault()}>
                  {this.props.label}
                </DropdownToggle>
                {ReactDOM.createPortal(
                  <DropdownMenu>
                    <MenuContext.Provider value={this}>
                      {open || !this.props.omitChildrenWhenClosed
                        ? this.props.children
                        : null}
                    </MenuContext.Provider>
                  </DropdownMenu>,
                  menuContainer,
                )}
              </div>
            </ContainedDropdown>
          );
        }}
      </MenuBarContext.Consumer>
    );
  }
}

/**
 * Represents a keyboard shortcut.
 *
 * @param charOrCode the character string or key code for the shortcut.
 * @param modifiers the key modifier mask.
 * @param aliases any alternate shortcuts for the command.
 */
export class Shortcut {
  static CTRL = 1 << 0;
  static ALT = 1 << 1;
  static SHIFT = 1 << 2;
  static META = 1 << 3;

  /** If set, enable the shortcut in fields even if it has no modifiers. */
  static FIELD_ENABLE = 1 << 4;

  /** If set, disable the shortcut in fields even if it does have modifiers. */
  static FIELD_DISABLE = 1 << 5;

  /** If set, enables the shortcut even for dialogs. */
  static DIALOG_ENABLE = 1 << 6;

  keyCode: number;
  modifiers: number;
  aliases: Shortcut[];

  constructor(
    charOrCode: string | number,
    modifiers: number = 0,
    aliases: Shortcut[] = [],
  ) {
    this.keyCode =
      typeof charOrCode === 'string' ? charOrCode.charCodeAt(0) : charOrCode;
    this.modifiers = modifiers;
    this.aliases = aliases;
  }

  matches(event: KeyboardEvent): boolean {
    for (const alias of this.aliases) {
      if (alias.matches(event)) {
        return true;
      }
    }
    if (
      event.keyCode !== this.keyCode ||
      event.ctrlKey !== !!(this.modifiers & Shortcut.CTRL) ||
      event.altKey !== !!(this.modifiers & Shortcut.ALT) ||
      event.shiftKey !== !!(this.modifiers & Shortcut.SHIFT) ||
      event.metaKey !== !!(this.modifiers & Shortcut.META)
    ) {
      return false;
    }
    const nodeName = (event.target: any).nodeName;
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
      if (
        event.ctrlKey || event.altKey || event.metaKey
          ? !!(this.modifiers & Shortcut.FIELD_DISABLE)
          : !(this.modifiers & Shortcut.FIELD_ENABLE)
      ) {
        return false;
      }
    }
    if (!(this.modifiers & Shortcut.DIALOG_ENABLE)) {
      let element: ?HTMLElement = (event.target: any);
      while (element) {
        if (element.getAttribute('role') === 'dialog') {
          return false;
        }
        element = (element.parentElement: any);
      }
    }
    return true;
  }

  render() {
    let key = this._renderKey();
    if (this.modifiers & Shortcut.META) {
      key = (
        <FormattedMessage
          id="key.modifiers.meta"
          defaultMessage="Meta+{key}"
          values={{key}}
        />
      );
    }
    if (this.modifiers & Shortcut.SHIFT) {
      key = (
        <FormattedMessage
          id="key.modifiers.shift"
          defaultMessage="Shift+{key}"
          values={{key}}
        />
      );
    }
    if (this.modifiers & Shortcut.ALT) {
      key = (
        <FormattedMessage
          id="key.modifiers.alt"
          defaultMessage="Alt+{key}"
          values={{key}}
        />
      );
    }
    if (this.modifiers & Shortcut.CTRL) {
      key = (
        <FormattedMessage
          id="key.modifiers.ctrl"
          defaultMessage="Ctrl+{key}"
          values={{key}}
        />
      );
    }
    return key;
  }

  _renderKey() {
    switch (this.keyCode) {
      case 46:
        return <FormattedMessage id="key.delete" defaultMessage="Del" />;
      case 107:
        return <FormattedMessage id="key.numpad_add" defaultMessage="+" />;
      case 109:
        return <FormattedMessage id="key.numpad_subtract" defaultMessage="-" />;
      case 192:
        return <FormattedMessage id="key.backtick" defaultMessage="~" />;
      default:
        return String.fromCharCode(this.keyCode);
    }
  }
}

/**
 * A simple menu item.
 *
 * @param props the element properties.
 * @param props.shortcut the item shortcut, if any.
 * @param props.disabled whether or not the item is disabled.
 * @param props.onClick the item click handler.
 * @param props.children the item contents.
 */
export class MenuItem extends React.Component<
  {
    shortcut?: ?Shortcut,
    disabled?: boolean,
    onClick?: mixed => mixed,
    children?: any,
  },
  {},
> {
  render() {
    return (
      <MenuContext.Consumer>
        {menu => (
          <DropdownItem
            disabled={this.props.disabled}
            onClick={this.props.onClick}
            onMouseOver={event => menu.setState({hoverItem: this})}>
            <span className="float-left">{this.props.children}</span>
            {this.props.shortcut ? (
              <span className="float-right shortcut">
                {this.props.shortcut.render()}
              </span>
            ) : null}
          </DropdownItem>
        )}
      </MenuContext.Consumer>
    );
  }

  componentDidMount() {
    this.props.shortcut && document.addEventListener('keydown', this._keydown);
  }

  componentWillUnmount() {
    this.props.shortcut &&
      document.removeEventListener('keydown', this._keydown);
  }

  _keydown = (event: KeyboardEvent) => {
    if (this.props.shortcut && this.props.shortcut.matches(event)) {
      event.preventDefault();
      this.props.disabled || !this.props.onClick || this.props.onClick();
    }
  };
}

/**
 * Handles a shortcut not associated with a menu item.
 *
 * @param props the element properties.
 * @param props.shortcut the shortcut to activate the command.
 * @param [props.disabled] whether or not the item is disabled.
 * @param props.onPress the function to call when the shortcut is pressed.
 */
export class ShortcutHandler extends React.Component<
  {shortcut: Shortcut, disabled?: boolean, onPress: () => void},
  {},
> {
  render() {
    return null;
  }

  componentDidMount() {
    document.addEventListener('keydown', this._keydown);
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this._keydown);
  }

  _keydown = (event: KeyboardEvent) => {
    if (this.props.shortcut.matches(event)) {
      event.preventDefault();
      if (!this.props.disabled) {
        this.props.onPress();
      }
    }
  };
}

/**
 * Calls a function every frame a shortcut is pressed.
 *
 * @param props the element properties.
 * @param props.shortcut the shortcut to activate the command.
 * @param [props.disabled] whether or not the item is disabled.
 * @param props.onFrame the function to call each frame with the amount of time
 * elapsed since the last, in seconds.
 */
export class FrameShortcutHandler extends React.Component<
  {shortcut: Shortcut, disabled?: boolean, onFrame: number => void},
  {},
> {
  _down = false;
  _lastTime = 0;

  render() {
    return null;
  }

  componentDidMount() {
    document.addEventListener('keydown', this._keydown);
    document.addEventListener('keyup', this._keyup);
  }

  componentWillUnmount() {
    this._down = false;
    document.removeEventListener('keydown', this._keydown);
    document.removeEventListener('keyup', this._keyup);
  }

  _keydown = (event: KeyboardEvent) => {
    if (this.props.shortcut.matches(event)) {
      event.preventDefault();
      if (!(this.props.disabled || this._down)) {
        this._down = true;
        this._lastTime = Date.now();
        requestAnimationFrame(this._handleFrame);
      }
    }
  };

  _keyup = (event: KeyboardEvent) => {
    if (this.props.shortcut.matches(event)) {
      event.preventDefault();
      this._down = false;
    }
  };

  _handleFrame = () => {
    if (this._down) {
      const now = Date.now();
      this.props.onFrame((now - this._lastTime) / 1000.0);
      this._lastTime = now;
      requestAnimationFrame(this._handleFrame);
    }
  };
}

function RawButton(props: Object) {
  const {innerRef, onClick, ...rest} = props;
  return <button ref={innerRef} {...rest} tabIndex={-1} />;
}

/**
 * A menu activated from a button.
 *
 * @param props the element properties.
 * @param props.label the button label.
 * @param props.direction the menu direction.
 * @param props.disabled whether or not the button is disabled.
 * @param props.children the menu contents.
 * @param props.omitChildrenWhenClosed if true, don't render the children when
 * the menu is closed (as an optimization).
 */
export class ButtonMenu extends React.Component<
  {
    label: React.Element<any>,
    direction?: string,
    disabled?: boolean,
    children?: mixed,
    omitChildrenWhenClosed?: boolean,
  },
  {active: boolean, hoverItem: ?React.Component<any, any>},
> {
  state = {active: false, hoverItem: null};

  render() {
    return (
      <MenuBarContext.Provider value={this}>
        <MenuContext.Provider value={this}>
          <ContainedDropdown
            className="text-center pb-2"
            isOpen={this.state.active}
            toggle={this._toggle}>
            <div>
              <DropdownToggle caret>{this.props.label}</DropdownToggle>
              {ReactDOM.createPortal(
                <DropdownMenu
                  right={this.props.direction === 'left'}
                  persist={true}>
                  {this.state.active || !this.props.omitChildrenWhenClosed ? (
                    this.props.children
                  ) : (
                    <div />
                  )}
                </DropdownMenu>,
                menuContainer,
              )}
            </div>
          </ContainedDropdown>
        </MenuContext.Provider>
      </MenuBarContext.Provider>
    );
  }

  _toggle = () => this.setState({active: !this.state.active});
}

type ContextMenuProps = {
  position: Vector2,
  close: () => void,
  children?: mixed,
};
type ContextMenuState = {
  active: boolean,
  hoverItem: ?React.Component<any, any>,
};

/**
 * A context menu.
 *
 * @param props the element properties.
 * @param props.position the menu client position.
 * @param props.close the function to close the menu.
 * @param props.children the menu contents.
 */
export class ContextMenu extends React.Component<
  ContextMenuProps,
  ContextMenuState,
> {
  state = {active: true, hoverItem: null};

  render() {
    return (
      <MenuBarContext.Provider value={this}>
        <MenuContext.Provider value={this}>
          <ContainedDropdown
            className="position-fixed"
            style={{left: this.props.position.x, top: this.props.position.y}}
            isOpen={this.state.active}
            toggle={this.props.close}>
            <Target />
            {ReactDOM.createPortal(
              <DropdownMenu>{this.props.children}</DropdownMenu>,
              menuContainer,
            )}
          </ContainedDropdown>
        </MenuContext.Provider>
      </MenuBarContext.Provider>
    );
  }

  componentDidUpdate(prevProps: ContextMenuProps, prevState: ContextMenuState) {
    if (prevState.active && !this.state.active) {
      this.props.close();
    }
  }
}

/**
 * A submenu for dropdown menus.
 *
 * @param props the element properties.
 * @param props.label the menu label.
 * @param props.disabled whether or not the menu is disabled.
 * @param props.children the menu contents.
 * @param props.omitChildrenWhenClosed if true, don't render the children when
 * the menu is closed (as an optimization).
 */
export class Submenu extends React.Component<
  {
    label: React.Element<any>,
    disabled?: boolean,
    children?: mixed,
    omitChildrenWhenClosed?: boolean,
  },
  {hoverItem: ?React.Component<any, any>},
> {
  state = {hoverItem: null};

  render() {
    return (
      <MenuBarContext.Consumer>
        {menuBar => (
          <MenuContext.Consumer>
            {menu => {
              const direction = menuBar.props.direction || 'right';
              return (
                <ContainedDropdown
                  direction={direction}
                  disabled={this.props.disabled}
                  onMouseOver={event =>
                    this.props.disabled || menu.setState({hoverItem: this})
                  }
                  isOpen={menu.state.hoverItem === this}
                  toggle={() =>
                    menuBar.setState({
                      active: !menuBar.state.active,
                    })
                  }>
                  <div>
                    <DropdownToggle
                      className={
                        'dropdown-item dropdown-toggle submenu-toggle' +
                        (menu.state.hoverItem === this ? ' active' : '')
                      }
                      disabled={this.props.disabled}
                      tag={RawButton}>
                      {this.props.label}
                    </DropdownToggle>
                    {ReactDOM.createPortal(
                      <DropdownMenu
                        modifiers={{
                          offset: {offset: '-11, 2'},
                          preventOverflow: {boundariesElement: 'window'},
                        }}>
                        <MenuContext.Provider value={this}>
                          {menu.state.hoverItem === this ||
                          !this.props.omitChildrenWhenClosed
                            ? this.props.children
                            : null}
                        </MenuContext.Provider>
                      </DropdownMenu>,
                      menuContainer,
                    )}
                  </div>
                </ContainedDropdown>
              );
            }}
          </MenuContext.Consumer>
        )}
      </MenuBarContext.Consumer>
    );
  }
}

type NumberFieldProps = {
  initialValue?: ?number,
  setValue: number => void,
  step?: ?number,
  wheelStep?: ?number,
  precision?: ?number,
  circular?: ?boolean,
  [string]: any,
};

/**
 * A number field with some customizations.
 *
 * @param initialValue the initial value of the field.
 * @param setValue the function to set the new value.
 * @param step the step size.
 * @param precision the precision at which to display the number.
 */
export class NumberField extends React.Component<
  NumberFieldProps,
  {value: string},
> {
  state = {value: String(this._getRoundedInitialValue())};

  render() {
    const {
      initialValue,
      setValue,
      wheelStep,
      precision,
      circular,
      ...props
    } = this.props;
    const step = props.step || 1;
    return (
      <Input
        type="number"
        value={this.state.value}
        onChange={event => this._setValue(event.target.value)}
        onWheel={event => {
          if (event.deltaY === 0) {
            return;
          }
          event.preventDefault();
          let numberValue = parseFloat(this.state.value);
          if (isNaN(numberValue)) {
            numberValue = 0.0;
          }
          const amount = wheelStep || step;
          const delta = event.deltaY > 0 ? -amount : amount;
          let newValue = numberValue + delta;
          const minimum = this.props.min;
          const maximum = this.props.max;
          if (circular && minimum != null && maximum != null) {
            while (newValue < minimum) {
              newValue += maximum - minimum;
            }
            while (newValue > maximum) {
              newValue -= maximum - minimum;
            }
          } else {
            if (minimum != null) {
              newValue = Math.max(minimum, newValue);
            }
            if (maximum != null) {
              newValue = Math.min(maximum, newValue);
            }
          }
          this._setValue(
            String(roundToPrecision(newValue, this._getPrecision())),
          );
        }}
        {...props}
      />
    );
  }

  componentDidUpdate(prevProps: NumberFieldProps) {
    if (prevProps.initialValue === this.props.initialValue) {
      return;
    }
    const currentValue = parseFloat(this.state.value);
    const newValue = this._getRoundedInitialValue();
    if (currentValue !== newValue) {
      this.setState({value: String(newValue)});
    }
  }

  _getRoundedInitialValue(): number {
    return roundToPrecision(this.props.initialValue || 0, this._getPrecision());
  }

  _getPrecision(): number {
    return this.props.precision || 1;
  }

  _setValue(value: string) {
    this.setState({value});
    const numberValue = parseFloat(value);
    isNaN(numberValue) || this.props.setValue(numberValue);
  }
}

type MaskFieldProps = {
  initialValue?: ?number,
  setValue: number => void,
  [string]: any,
};

/**
 * A field for editing a bit mask.
 *
 * @param initialValue the initial value of the field.
 * @param setValue the function to set the new value.
 */
export class MaskField extends React.Component<
  MaskFieldProps,
  {value: string},
> {
  state = {value: toPaddedBinaryString(this._getInitialValue())};

  render() {
    const {initialValue, setValue, ...props} = this.props;
    return (
      <Input
        value={this.state.value}
        onChange={event => this._setValue(event.target.value)}
        {...props}
      />
    );
  }

  componentDidUpdate(prevProps: NumberFieldProps) {
    if (prevProps.initialValue === this.props.initialValue) {
      return;
    }
    const currentValue = parseInt(this.state.value, 2);
    const newValue = this._getInitialValue();
    if (currentValue !== newValue) {
      this.setState({value: toPaddedBinaryString(newValue)});
    }
  }

  _getInitialValue(): number {
    return this.props.initialValue || 0;
  }

  _setValue(value: string) {
    if (!/^[01]*$/.test(value) || value.length > 32) {
      return;
    }
    this.setState({value});
    const numberValue = parseInt(value, 2);
    isNaN(numberValue) || this.props.setValue(numberValue);
  }
}

function toPaddedBinaryString(value: number) {
  const base = value.toString(2);
  return '0'.repeat(Math.max(8 - base.length, 0)) + base;
}

type ColorFieldProps = {
  initialValue?: ?string,
  setValue: string => void,
  defaultValue: string,
  [string]: any,
};

/**
 * A field for editing a color (as a hex string).
 *
 * @param initialValue the initial value of the field.
 * @param setValue the function to set the new value.
 */
export class ColorField extends React.Component<
  ColorFieldProps,
  {value: string},
> {
  state = {value: this._getInitialValue()};

  _input: ?HTMLInputElement;
  _picker: ?HTMLInputElement;

  render() {
    const {initialValue, setValue, defaultValue, ...props} = this.props;
    return (
      <div className="d-flex">
        <InputGroup>
          <Input
            innerRef={input => {
              this._input = input;
              this._updateInput();
            }}
            className="flex-grow-1 color-input"
            type="text"
            size="8"
            value={this.state.value}
            onChange={event => this._setValue(event.target.value)}
            {...props}
          />
          <InputGroupAddon addonType="append">
            <Button
              className="pl-1 pr-1 color-picker-button"
              onClick={() => this._picker && this._picker.click()}>
              <FontAwesomeIcon icon="ellipsis-v" />
            </Button>
          </InputGroupAddon>
        </InputGroup>
        <Input
          innerRef={picker => (this._picker = picker)}
          className="d-none"
          type="color"
          value={this.state.value}
          onChange={event => this._setValue(event.target.value)}
        />
      </div>
    );
  }

  componentDidUpdate(prevProps: ColorFieldProps) {
    if (prevProps.initialValue === this.props.initialValue) {
      return;
    }
    const newValue = this._getInitialValue();
    if (this.state.value !== newValue) {
      this.setState({value: newValue});
    }
  }

  _getInitialValue(): string {
    return this.props.initialValue || this.props.defaultValue;
  }

  _setValue(value: string) {
    if (!/^#[0-9a-fA-F]*$/.test(value) || value.length > 7) {
      return;
    }
    this.setState({value});
    if (value.length === 7) {
      this.props.setValue(value);
    }
    this._updateInput();
  }

  _updateInput() {
    const input = this._input;
    if (input && this.state.value.length === 7) {
      input.style.backgroundColor = this.state.value;
      const green = parseInt(this.state.value.substring(3, 5), 16);
      if (green > 128) {
        input.style.color = '#000';
      } else {
        input.style.color = '#fff';
      }
    }
  }
}

/**
 * Renders a React element to text with appropriate i18n.
 *
 * @param element the element to render.
 * @param locale the locale in which to render the element.
 * @return the rendered text.
 */
export function renderText(element: Element<*>, locale: string): string {
  return ReactDOMServer.renderToStaticMarkup(
    <ReactRedux.Provider store={store}>
      <IntlProvider
        locale={locale}
        defaultLocale="en-US"
        textComponent={(props: {children: string}) => props.children}>
        {element}
      </IntlProvider>
    </ReactRedux.Provider>,
  );
}

// we never want the default, "open dragged link" behavior
const defaultPreventer = (event: Event) => event.preventDefault();
document.addEventListener('dragover', defaultPreventer);
document.addEventListener('drop', defaultPreventer);
