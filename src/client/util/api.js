// @flow

const DEFAULT_API_ENDPOINT = '/api';

let apiEndpoint = DEFAULT_API_ENDPOINT;

// get the API endpoint from the meta tags
for (const element of document.getElementsByTagName('META')) {
  if (element.getAttribute('name') === 'pml-api-endpoint') {
    apiEndpoint = element.getAttribute('content') || DEFAULT_API_ENDPOINT;
    break;
  }
}

const AUTH_TOKEN_COOKIE = 'authToken=';

let authToken: ?string;

// check cookies for an auth token
for (const cookie of document.cookie.split(';')) {
  if (cookie.startsWith(AUTH_TOKEN_COOKIE)) {
    authToken = cookie.substring(AUTH_TOKEN_COOKIE.length);
    break;
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
