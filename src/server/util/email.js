/**
 * Email utility functions.
 *
 * @module server/util/email
 * @flow
 */

import {SES} from 'aws-sdk';
import React from 'react';
import type {Element} from 'react';
import ReactDOMServer from 'react-dom/server';
import {IntlProvider} from 'react-intl';

/** The 'from' email as specified in an environment variable. */
export const FROM_EMAIL = process.env.FROM_URL || 'noreply@phantasml.com';

/** The configured first admin email. */
export const FIRST_ADMIN_EMAIL = process.env.FIRST_ADMIN_EMAIL || '';

/** Shared SES instance. */
export const ses = new SES();

export function renderHtml(element: Element<*>, locale: string): string {
  return ReactDOMServer.renderToStaticMarkup(
    <IntlProvider locale={locale} defaultLocale="en-US">
      {element}
    </IntlProvider>,
  );
}

export function renderText(element: Element<*>, locale: string): string {
  return ReactDOMServer.renderToStaticMarkup(
    <IntlProvider
      locale={locale}
      defaultLocale="en-US"
      textComponent={(props: {children: string}) => props.children}>
      {element}
    </IntlProvider>,
  );
}
