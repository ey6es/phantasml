/**
 * API utility functions.
 *
 * @module client/util/api
 * @flow
 */

const DEFAULT_API_ENDPOINT = '/api';

let apiEndpoint = DEFAULT_API_ENDPOINT;

// get the API endpoint from the meta tags
for (const element of document.getElementsByTagName('META')) {
  if (element.getAttribute('name') === 'pml-api-endpoint') {
    apiEndpoint = element.getAttribute('content') || DEFAULT_API_ENDPOINT;
    break;
  }
}

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
if (!authToken) {
  const AUTH_TOKEN_COOKIE = 'authToken=';
  for (const cookie of document.cookie.split(';')) {
    if (cookie.startsWith(AUTH_TOKEN_COOKIE)) {
      authToken = decodeURIComponent(
        cookie.substring(AUTH_TOKEN_COOKIE.length),
      );
      break;
    }
  }
}

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

export async function postToApi<RequestType: Object, ResponseType: Object>(
  path: string,
  request: RequestType,
): Promise<ResponseType> {
  const response = await fetch(apiEndpoint + path, {
    method: 'POST',
    body: JSON.stringify(Object.assign({authToken}, request)),
  });
  const data = await response.json();
  return data;
}
