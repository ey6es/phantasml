/**
 * Redux store for client.
 *
 * @module client/store
 * @flow
 */

import * as Redux from 'redux';
import {reducer as resource} from '../server/store/resource';

const store = Redux.createStore(Redux.combineReducers({resource}));

/** The global Redux store. */
export default store;
