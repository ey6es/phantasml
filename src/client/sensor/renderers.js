/**
 * Sensor renderers.
 *
 * @module client/sensor/renderers
 * @flow
 */

import {ComponentRenderers, BaseRenderer} from '../renderer/renderers';
import {extend} from '../../server/store/util';

ComponentRenderers.sensorRenderer = extend(BaseRenderer, {});
