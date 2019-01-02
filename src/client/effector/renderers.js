/**
 * Effector renderers.
 *
 * @module client/effector/renderers
 * @flow
 */

import {ComponentRenderers, BaseRenderer} from '../renderer/renderers';
import {extend} from '../../server/store/util';

ComponentRenderers.effectorRenderer = extend(BaseRenderer, {});
