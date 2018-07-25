/**
 * Components related to user management.
 *
 * @module client/user
 * @flow
 */

import * as React from 'react';
import {Modal, ModalHeader, ModalBody, ModalFooter, Button} from 'reactstrap';

export function LoginDialog(props: {canCreateUser: ?boolean}) {
  return <Modal />;
}

export function AcceptInviteDialog(props: {}) {
  return <Modal />;
}

export function PasswordResetDialog(props: {}) {
  return <Modal />;
}
