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

export async function postToApi<RequestType: Object, ResponseType: Object>(
  path: string,
  request: RequestType,
): Promise<ResponseType> {
  const response = await fetch(apiEndpoint + path, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  const data = await response.json();
  return data;
}
