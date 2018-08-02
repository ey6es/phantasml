/**
 * API utility functions.
 *
 * @module client/util/api
 * @flow
 */

// extract the metatag content
export const metatags: Map<?string, ?string> = new Map(
  Array.from(document.getElementsByTagName('META'), element => [
    element.getAttribute('name'),
    element.getAttribute('content'),
  ]),
);

// get the api endpoint
const apiEndpoint = metatags.get('phantasml-api-endpoint') || '/api';

// check for, remove auth token parameter
let authToken: ?string;
if (location.search.startsWith('?')) {
  const AUTH_TOKEN_PARAM = 't=';
  const params = location.search.substring(1).split('&');
  for (let ii = 0; ii < params.length; ii++) {
    const param = params[ii];
    if (param.startsWith(AUTH_TOKEN_PARAM)) {
      authToken = decodeURIComponent(param.substring(AUTH_TOKEN_PARAM.length));
      params.splice(ii, 1);
      const search = params.length === 0 ? '' : '?' + params.join('&');
      history.replaceState(
        {},
        document.title,
        location.pathname + search + location.hash,
      );
      break;
    }
  }
}

// check cookies for an auth token
const AUTH_TOKEN_COOKIE = 'authToken=';
if (!authToken) {
  for (const cookie of document.cookie.split(';')) {
    if (cookie.startsWith(AUTH_TOKEN_COOKIE)) {
      authToken = decodeURIComponent(
        cookie.substring(AUTH_TOKEN_COOKIE.length),
      );
      break;
    }
  }
}

/**
 * Sets the auth token and associated cookie.
 *
 * @param token the new auth token.
 * @param [persist] whether or not the token persists between sessions.
 */
export function setAuthToken(token: string, persist: ?boolean) {
  authToken = token;
  let expires = '';
  if (persist) {
    const oneYearLater = Date.now() + 365 * 24 * 60 * 60 * 1000;
    expires = `; expires=${new Date(oneYearLater).toUTCString()}`;
  }
  document.cookie = `${AUTH_TOKEN_COOKIE}${token}${expires}; secure`;
}

/**
 * Clears the auth token and associated cookie.
 */
export function clearAuthToken() {
  authToken = null;
  document.cookie = `${AUTH_TOKEN_COOKIE}; expires=${new Date().toUTCString()}`;
}

/**
 * Makes a GET request to the API endpoint, including the auth token in the
 * parameters.
 *
 * @param path the path of the function to call.
 * @param request the request object.
 * @return a promise that will resolve to the response object.
 */
export async function getFromApi<RequestType: Object, ResponseType: Object>(
  path: string,
  request: RequestType = ({}: any),
): Promise<ResponseType> {
  let query = '';
  let requestWithToken = Object.assign({authToken}, request);
  for (const [key, value] of Object.entries(requestWithToken)) {
    if (value === undefined) {
      continue;
    }
    query +=
      (query.length === 0 ? '?' : '&') +
      encodeURIComponent(key) +
      '=' +
      encodeURIComponent(
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      );
  }
  const response = await fetch(apiEndpoint + path + query);
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * Makes a POST request to the API endpoint, including the auth token in the
 * parameters.
 *
 * @param path the path of the function to call.
 * @param request the request object.
 * @return a promise that will resolve to the response object.
 */
export async function postToApi<RequestType: Object, ResponseType: Object>(
  path: string,
  request: RequestType,
): Promise<ResponseType> {
  const response = await fetch(apiEndpoint + path, {
    method: 'POST',
    body: JSON.stringify(Object.assign({authToken}, request)),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}
