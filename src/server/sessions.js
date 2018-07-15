// @flow

export function handler(event: any, context: any, callback: any) {
  console.log('hello');
  callback(null, {body: 'Yep?'});
}
