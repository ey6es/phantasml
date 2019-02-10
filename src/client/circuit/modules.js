/**
 * Circuit component implementations.
 *
 * @module client/circuit/modules
 * @flow
 */

import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import {
  InputsProperty,
  OutputsProperty,
  ElementsProperty,
  CircuitComponents,
} from './components';
import type {HoverState} from '../store';
import {store} from '../store';
import {EntityName} from '../entity';
import type {Renderer} from '../renderer/util';
import {renderPointHelper, renderLineHelper} from '../renderer/helpers';
import {ComponentSensors} from '../sensor/sensors';
import {ComponentEffectors} from '../effector/effectors';
import {ShapeList} from '../../server/store/shape';
import type {Entity} from '../../server/store/resource';
import type {IdTreeNode} from '../../server/store/scene';
import {SceneActions} from '../../server/store/scene';
import type {Transform, Vector2} from '../../server/store/math';
import {
  TWO_PI,
  HALF_PI,
  vec2,
  equals,
  length,
  rotateEquals,
  times,
  normalize,
  cross,
  composeTransforms,
  isTransform,
  clamp,
} from '../../server/store/math';
import {getValue, extend} from '../../server/store/util';

/** Data associated with a single input. */
export type InputData = {
  label: React.Element<any>,
};

/** Data associated with a single output. */
export type OutputData = {
  label: React.Element<any>,
};

type ModuleData = {
  getIcon: Object => ShapeList,
  getInputs: (IdTreeNode, Object) => {[string]: InputData},
  getOutputs: (IdTreeNode, Object) => {[string]: OutputData},
  getOutputTransform: Object => Transform,
  getWidth: Object => number,
  getHeight: (Object, number, number) => number,
  drawBody: (Object, number, number, ShapeList) => void,
  createRenderFn: (
    IdTreeNode,
    Entity,
    (Renderer, boolean, HoverState) => void,
  ) => (Renderer, boolean, HoverState) => void,
  onMove: (Entity, Vector2) => HoverState,
  onPress: (Entity, Vector2, Vector2) => [HoverState, boolean],
  onDrag: (Entity, Vector2, (string, HoverState) => void) => HoverState,
  onRelease: (Entity, Vector2) => HoverState,
};

const SingleInput = {
  input: {
    label: <FormattedMessage id="circuit.input" defaultMessage="Input" />,
  },
};

const SingleOutput = {
  output: {
    label: <FormattedMessage id="circuit.output" defaultMessage="Output" />,
  },
};

const White = [1.0, 1.0, 1.0];
const DarkGray = [0.25, 0.25, 0.25];

const IconAttributes = {
  thickness: 0.15,
  pathColor: White,
  fillColor: White,
};

const ForkIcon = new ShapeList()
  .move(-0.375, 0.0)
  .penDown(false, IconAttributes)
  .advance(0.375)
  .pivot(45)
  .advance(Math.SQRT1_2 * 0.75)
  .penUp()
  .move(0, 0, -45)
  .penDown()
  .advance(Math.SQRT1_2 * 0.75);

const AddIcon = new ShapeList()
  .move(-0.375, 0)
  .penDown(false, IconAttributes)
  .advance(0.75)
  .penUp()
  .move(0, -0.375, 90)
  .penDown()
  .advance(0.75);

const SubtractIcon = new ShapeList()
  .move(-0.375, 0)
  .penDown(false, IconAttributes)
  .advance(0.75);

const MultiplyIcon = new ShapeList()
  .move(0, -0.375, 90)
  .penDown(false, IconAttributes)
  .advance(0.75)
  .penUp()
  .move(-0.3, -0.15, 26.565)
  .penDown()
  .advance(0.6708)
  .penUp()
  .move(-0.3, 0.15, -26.565)
  .penDown()
  .advance(0.6708);

const DivideIcon = new ShapeList()
  .move(-0.144, -0.346, 67.5)
  .penDown(false, IconAttributes)
  .advance(0.75);

const ButtonDialIcon = new ShapeList().penDown(false, {
  thickness: 1.2,
  pathColor: White,
});

function getDialValue(position: Vector2): number {
  return Math.atan2(position.x, position.y) / TWO_PI + 0.5;
}

function getDialTransform(value: ?number): Transform {
  const rotation = getDialRotation(value);
  return {
    translation: rotateEquals(vec2(0.7, 0), rotation),
    rotation,
  };
}

function getDialRotation(value: ?number): number {
  return HALF_PI - ((value || 0.0) - 0.5) * TWO_PI;
}

const TOGGLE_SWITCH_SIZE = 0.6;
const HALF_TOGGLE_SWITCH_SIZE = TOGGLE_SWITCH_SIZE * 0.5;
const KNOB_THICKNESS = 0.4;

function getToggleSwitchPosition(value: ?boolean): Vector2 {
  return vec2((value ? 1 : -1) * HALF_TOGGLE_SWITCH_SIZE, 0.0);
}

const ToggleSwitchIcon = new ShapeList()
  .move(-HALF_TOGGLE_SWITCH_SIZE, 0.0)
  .penDown(false, {thickness: KNOB_THICKNESS, pathColor: DarkGray})
  .advance(TOGGLE_SWITCH_SIZE);

const SLIDER_SIZE = 4.5;
const HALF_SLIDER_SIZE = SLIDER_SIZE * 0.5;

function getSliderValue(position: Vector2): number {
  return clamp(position.x / SLIDER_SIZE + 0.5, 0.0, 1.0);
}

function getSliderPosition(value: ?number): Vector2 {
  return vec2(((value || 0.0) - 0.5) * SLIDER_SIZE, 0.0);
}

const SliderIcon = new ShapeList()
  .move(-HALF_SLIDER_SIZE, 0)
  .penDown(false, {thickness: 0.15, pathColor: DarkGray})
  .advance(SLIDER_SIZE);

const JOYSTICK_SIZE = 1.5;
const HALF_JOYSTICK_SIZE = JOYSTICK_SIZE * 0.5;

function getJoystickValue(position: Vector2): Vector2 {
  return vec2(
    clamp(position.x / HALF_JOYSTICK_SIZE, -1.0, 1.0),
    clamp(position.y / HALF_JOYSTICK_SIZE, -1.0, 1.0),
  );
}

function getJoystickPosition(value: ?Vector2): ?Vector2 {
  return value && times(value, HALF_JOYSTICK_SIZE);
}

const JoystickIcon = new ShapeList()
  .move(-HALF_JOYSTICK_SIZE, -HALF_JOYSTICK_SIZE)
  .penDown(true, {
    thickness: 0.15,
    pathColor: DarkGray,
    fillColor: DarkGray,
  })
  .advance(JOYSTICK_SIZE)
  .pivot(90)
  .advance(JOYSTICK_SIZE)
  .pivot(90)
  .advance(JOYSTICK_SIZE)
  .pivot(90)
  .advance(JOYSTICK_SIZE);

const NoIcon = new ShapeList();

const DEFAULT_MODULE_WIDTH = 3.0;

/** The height of each terminal. */
export const MODULE_HEIGHT_PER_TERMINAL = 1.5;

const BaseModule = {
  getIcon: data => NoIcon,
  getInputs: (idTree, data) => ({}),
  getOutputs: (idTree, data) => ({}),
  getWidth: data => DEFAULT_MODULE_WIDTH,
  getHeight: (data, inputCount, outputCount) => {
    return Math.max(inputCount, outputCount) * MODULE_HEIGHT_PER_TERMINAL;
  },
  getOutputTransform: data => null,
  drawBody: (data, width, height, shapeList) => {
    shapeList
      .move(width * -0.5, height * -0.5, 0)
      .penDown(true)
      .advance(width)
      .pivot(90)
      .advance(height)
      .pivot(90)
      .advance(width)
      .pivot(90)
      .advance(height)
      .penUp();
  },
  createRenderFn: (idTree, entity, baseFn) => baseFn,
  onMove: (entity, position) => true,
  onPress: (entity, position, offset) => [{dragging: position, offset}, true],
  onDrag: (entity, position, setHoverState) => {
    return store.getState().hoverStates.get(entity.id);
  },
  onRelease: (entity, position) => {},
};

const BUTTON_DIAL_RADIUS = 0.9;

/**
 * Circuit component functions mapped by component name.
 */
export const ComponentModules: {[string]: ModuleData} = {
  fork: extend(BaseModule, {
    getIcon: data => ForkIcon,
    getInputs: (idTree, data) => SingleInput,
    getOutputs: createMultipleOutputs,
  }),
  bundle: extend(BaseModule, {
    getWidth: data => MODULE_HEIGHT_PER_TERMINAL,
    getInputs: createElementInputs,
    getOutputs: createElementOutputs,
  }),
  bend: extend(BaseModule, {
    getWidth: data => {
      const elementCount =
        data.elements || ElementsProperty.elements.defaultValue;
      return MODULE_HEIGHT_PER_TERMINAL * elementCount;
    },
    getInputs: createElementInputs,
    getOutputs: createElementOutputs,
    getOutputTransform: data => ({rotation: data.left ? HALF_PI : -HALF_PI}),
    drawBody: (data, width, height, shapeList) => {
      if (data.left) {
        shapeList.move(width * -0.5, height * 0.5, -90);
      } else {
        shapeList.move(width * -0.5, height * -0.5, 0);
      }
      shapeList
        .penDown(true)
        .advance(width)
        .pivot(135)
        .advance(Math.sqrt(width * width + height * height))
        .pivot(135)
        .advance(height)
        .penUp();
    },
  }),
  add: extend(BaseModule, {
    getIcon: data => AddIcon,
    getInputs: (idTree, data) =>
      createMultipleInputs(data, 'summand', index => (
        <FormattedMessage
          id="add.summand.n"
          defaultMessage="Summand {number}"
          values={{number: index}}
        />
      )),
    getOutputs: (idTree, data) => ({
      sum: {
        label: <FormattedMessage id="add.sum" defaultMessage="Sum" />,
      },
    }),
  }),
  subtract: extend(BaseModule, {
    getIcon: data => SubtractIcon,
    getInputs: (idTree, data) => {
      const subtrahend = {
        subtrahend: {
          label: (
            <FormattedMessage
              id="subtract.subtrahend"
              defaultMessage="Subtrahend"
            />
          ),
        },
      };
      if (data.unary) {
        return subtrahend;
      }
      return {
        minuend: {
          label: (
            <FormattedMessage id="subtract.minuend" defaultMessage="Minuend" />
          ),
        },
        ...subtrahend,
      };
    },
    getOutputs: (idTree, data) => ({
      difference: {
        label: (
          <FormattedMessage
            id="subtract.difference"
            defaultMessage="Difference"
          />
        ),
      },
    }),
  }),
  multiply: extend(BaseModule, {
    getIcon: data => MultiplyIcon,
    getInputs: (idTree, data) =>
      createMultipleInputs(data, 'factor', index => (
        <FormattedMessage
          id="multiply.factor.n"
          defaultMessage="Factor {number}"
          values={{number: index}}
        />
      )),
    getOutputs: (idTree, data) => ({
      product: {
        label: (
          <FormattedMessage id="multiply.product" defaultMessage="Product" />
        ),
      },
    }),
  }),
  divide: extend(BaseModule, {
    getIcon: data => DivideIcon,
    getInputs: (idTree, data) => {
      const divisor = {
        divisor: {
          label: (
            <FormattedMessage id="divide.divisor" defaultMessage="Divisor" />
          ),
        },
      };
      if (data.unary) {
        return divisor;
      }
      return {
        dividend: {
          label: (
            <FormattedMessage id="divide.dividend" defaultMessage="Dividend" />
          ),
        },
        ...divisor,
      };
    },
    getOutputs: (idTree, data) => ({
      quotient: {
        label: (
          <FormattedMessage id="divide.quotient" defaultMessage="Quotient" />
        ),
      },
    }),
  }),
  pushButton: extend(BaseModule, {
    getIcon: (idTree, data) => ButtonDialIcon,
    getOutputs: (idTree, data) => SingleOutput,
    getHeight: data => DEFAULT_MODULE_WIDTH,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        baseFn(renderer, selected, hoverState);
        renderPointHelper(
          renderer,
          isTransform(hoverState)
            ? composeTransforms(hoverState, transform)
            : transform,
          BUTTON_DIAL_RADIUS,
          entity.state.pushButton.value
            ? '#00ffff'
            : hoverState && hoverState.value
            ? '#00bfbf'
            : '#009999',
          false,
        );
      };
    },
    onMove: (entity, position) => {
      if (length(position) > BUTTON_DIAL_RADIUS) {
        return true;
      }
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      return oldHoverState && oldHoverState.value
        ? oldHoverState
        : {value: true};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              pushButton: {value: true},
            },
          },
          false,
        ),
      );
      return [oldHoverState, false];
    },
    onRelease: (entity, position) => {
      if (entity.state.pushButton.value) {
        store.dispatch(
          SceneActions.editEntities.create(
            {
              [entity.id]: {
                pushButton: {value: null},
              },
            },
            false,
          ),
        );
      }
    },
  }),
  toggleSwitch: extend(BaseModule, {
    getIcon: data => ToggleSwitchIcon,
    getOutputs: (idTree, data) => SingleOutput,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        baseFn(renderer, selected, hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(
            isTransform(hoverState)
              ? composeTransforms(hoverState, transform)
              : transform,
            {
              translation: getToggleSwitchPosition(
                entity.state.toggleSwitch.value,
              ),
            },
          ),
          KNOB_THICKNESS,
          '#ffffff',
          false,
        );
        if (hoverState && hoverState.value != null) {
          renderLineHelper(
            renderer,
            transform,
            KNOB_THICKNESS,
            '#ffffff',
            TOGGLE_SWITCH_SIZE,
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (
        Math.abs(position.x) > HALF_TOGGLE_SWITCH_SIZE + KNOB_THICKNESS ||
        Math.abs(position.y) > KNOB_THICKNESS
      ) {
        return true;
      }
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      const value = !entity.state.toggleSwitch.value;
      return oldHoverState && oldHoverState.value === value
        ? oldHoverState
        : {value};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            toggleSwitch: {value: !entity.state.toggleSwitch.value},
          },
        }),
      );
      return [oldHoverState, false];
    },
  }),
  dial: extend(BaseModule, {
    getIcon: data => ButtonDialIcon,
    getOutputs: (idTree, data) => SingleOutput,
    getHeight: data => DEFAULT_MODULE_WIDTH,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        baseFn(renderer, selected, hoverState);
        let centerTransform = transform;
        if (isTransform(hoverState)) {
          centerTransform = composeTransforms(hoverState, transform);
        }
        renderPointHelper(
          renderer,
          centerTransform,
          BUTTON_DIAL_RADIUS,
          '#404040',
          false,
        );
        renderLineHelper(
          renderer,
          composeTransforms(
            centerTransform,
            getDialTransform(entity.state.dial.value),
          ),
          0.2,
          '#ffffff',
          0.4,
          false,
        );
        if (hoverState && hoverState.value != null) {
          renderLineHelper(
            renderer,
            composeTransforms(transform, getDialTransform(hoverState.value)),
            0.2,
            '#ffffff',
            0.4,
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (length(position) > BUTTON_DIAL_RADIUS) {
        return true;
      }
      return {value: getDialValue(position)};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            dial: {value: getDialValue(position)},
          },
        }),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return oldHoverState;
      }
      // use vectors to compute delta in order to enforce dial limits
      const oldValue = entity.state.dial.value || 0.0;
      const oldVector = rotateEquals(vec2(1.0, 0.0), getDialRotation(oldValue));
      const newVector = normalize(position);
      const delta = Math.asin(cross(newVector, oldVector)) / TWO_PI;
      const value = clamp(oldValue + delta, 0.0, 1.0);
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            dial: {value},
          },
        }),
      );
      return {value};
    },
  }),
  slider: extend(BaseModule, {
    getIcon: data => SliderIcon,
    getWidth: data => DEFAULT_MODULE_WIDTH * 2.0,
    getOutputs: (idTree, data) => SingleOutput,
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        baseFn(renderer, selected, hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(
            isTransform(hoverState)
              ? composeTransforms(hoverState, transform)
              : transform,
            {
              translation: getSliderPosition(entity.state.slider.value),
            },
          ),
          KNOB_THICKNESS,
          '#ffffff',
          false,
        );
        if (hoverState && hoverState.value != null) {
          renderPointHelper(
            renderer,
            composeTransforms(transform, {
              translation: getSliderPosition(hoverState.value),
            }),
            KNOB_THICKNESS,
            '#ffffff',
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (
        Math.abs(position.x) > HALF_SLIDER_SIZE + KNOB_THICKNESS ||
        Math.abs(position.y) > KNOB_THICKNESS
      ) {
        return true;
      }
      return {value: getSliderValue(position)};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            slider: {value: getSliderValue(position)},
          },
        }),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value != null)) {
        return oldHoverState;
      }
      const value = getSliderValue(position);
      store.dispatch(
        SceneActions.editEntities.create({
          [entity.id]: {
            slider: {value},
          },
        }),
      );
      return {value};
    },
  }),
  joystick: extend(BaseModule, {
    getIcon: data => JoystickIcon,
    getOutputs: (idTree, data) => ({
      leftRight: {
        label: (
          <FormattedMessage
            id="joystick.left_right"
            defaultMessage="Left/Right"
          />
        ),
      },
      downUp: {
        label: (
          <FormattedMessage id="joystick.down_up" defaultMessage="Down/Up" />
        ),
      },
    }),
    createRenderFn: (idTree, entity, baseFn) => {
      const transform = entity.getLastCachedValue('worldTransform');
      return (renderer, selected, hoverState) => {
        baseFn(renderer, selected, hoverState);
        renderPointHelper(
          renderer,
          composeTransforms(
            isTransform(hoverState)
              ? composeTransforms(hoverState, transform)
              : transform,
            {
              translation: getJoystickPosition(entity.state.joystick.value),
            },
          ),
          KNOB_THICKNESS,
          '#ffffff',
          false,
        );
        if (hoverState && hoverState.value) {
          renderPointHelper(
            renderer,
            composeTransforms(transform, {
              translation: getJoystickPosition(hoverState.value),
            }),
            KNOB_THICKNESS,
            '#ffffff',
            true,
          );
        }
      };
    },
    onMove: (entity, position) => {
      if (
        Math.abs(position.x) > HALF_JOYSTICK_SIZE + KNOB_THICKNESS ||
        Math.abs(position.y) > HALF_JOYSTICK_SIZE + KNOB_THICKNESS
      ) {
        return true;
      }
      return {value: getJoystickValue(position)};
    },
    onPress: (entity, position, offset) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value)) {
        return [{dragging: position, offset}, true];
      }
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              joystick: {value: getJoystickValue(position)},
            },
          },
          entity.state.joystick.autocenter === false,
        ),
      );
      return [oldHoverState, false];
    },
    onDrag: (entity, position, setHoverState) => {
      const oldHoverState = store.getState().hoverStates.get(entity.id);
      if (!(oldHoverState && oldHoverState.value)) {
        return oldHoverState;
      }
      const value = getJoystickValue(position);
      store.dispatch(
        SceneActions.editEntities.create(
          {
            [entity.id]: {
              joystick: {value},
            },
          },
          entity.state.joystick.autocenter === false,
        ),
      );
      return {value};
    },
    onRelease: (entity, position) => {
      if (
        entity.state.joystick.value &&
        entity.state.joystick.autocenter !== false
      ) {
        store.dispatch(
          SceneActions.editEntities.create(
            {
              [entity.id]: {
                joystick: {value: null},
              },
            },
            false,
          ),
        );
      }
    },
  }),
  lamp: extend(BaseModule, {
    getHeight: data => DEFAULT_MODULE_WIDTH,
    getInputs: (idTree, data) => SingleInput,
  }),
  barGraph: extend(BaseModule, {
    getWidth: data => MODULE_HEIGHT_PER_TERMINAL,
    getHeight: data => DEFAULT_MODULE_WIDTH,
    getInputs: (idTree, data) => SingleInput,
  }),
  gauge: extend(BaseModule, {
    getHeight: data => DEFAULT_MODULE_WIDTH,
    getInputs: (idTree, data) => SingleInput,
  }),
  pseudo3d: extend(BaseModule, {
    getWidth: data =>
      getValue(
        data.width,
        CircuitComponents.pseudo3d.properties.width.defaultValue,
      ),
    getHeight: data =>
      getValue(
        data.height,
        CircuitComponents.pseudo3d.properties.height.defaultValue,
      ),
  }),
  inputBus: extend(BaseModule, {
    getOutputs: (idTree, data) => {
      if (!data.sensors) {
        return {};
      }
      const outputs = {};
      for (const id in data.sensors) {
        const entity = idTree.getEntity(id);
        if (!entity) {
          continue;
        }
        for (const key in entity.state) {
          const sensor = ComponentSensors[key];
          if (sensor) {
            const sensorOutputs = sensor.getOutputs(entity.state[key]);
            for (const name in sensorOutputs) {
              outputs[id + '$' + name] = {
                label: (
                  <TerminalName
                    entity={entity}
                    label={sensorOutputs[name].label}
                  />
                ),
              };
            }
            break;
          }
        }
      }
      return outputs;
    },
    getWidth: data => MODULE_HEIGHT_PER_TERMINAL,
    getHeight: (data, inputCount, outputCount) => {
      return Math.max(inputCount, outputCount, 1) * MODULE_HEIGHT_PER_TERMINAL;
    },
  }),
  outputBus: extend(BaseModule, {
    getInputs: (idTree, data) => {
      if (!data.effectors) {
        return {};
      }
      const inputs = {};
      for (const id in data.effectors) {
        const entity = idTree.getEntity(id);
        if (!entity) {
          continue;
        }
        for (const key in entity.state) {
          const effector = ComponentEffectors[key];
          if (effector) {
            const effectorInputs = effector.getInputs(entity.state[key]);
            for (const name in effectorInputs) {
              inputs[id + '$' + name] = {
                label: (
                  <TerminalName
                    entity={entity}
                    label={effectorInputs[name].label}
                  />
                ),
              };
            }
            break;
          }
        }
      }
      return inputs;
    },
    getWidth: data => MODULE_HEIGHT_PER_TERMINAL,
    getHeight: (data, inputCount, outputCount) => {
      return Math.max(inputCount, outputCount, 1) * MODULE_HEIGHT_PER_TERMINAL;
    },
  }),
};

function TerminalName(props: {entity: Entity, label: React.Element<any>}) {
  return (
    <FormattedMessage
      id="terminal.name"
      defaultMessage="{entity} {label}"
      values={{
        entity: <EntityName entity={props.entity} />,
        label: props.label,
      }}
    />
  );
}

function createMultipleInputs(
  data: Object,
  keyBase: string,
  getLabel: number => React.Element<any>,
): {[string]: InputData} {
  const inputs = {};
  const inputCount = data.inputs || InputsProperty.inputs.defaultValue;
  for (let ii = 1; ii <= inputCount; ii++) {
    inputs[keyBase + ii] = {label: getLabel(ii)};
  }
  return inputs;
}

function createMultipleOutputs(
  idTree: IdTreeNode,
  data: Object,
): {[string]: OutputData} {
  const outputs = {};
  const outputCount = data.outputs || OutputsProperty.outputs.defaultValue;
  for (let ii = 1; ii <= outputCount; ii++) {
    outputs['output' + ii] = {
      label: (
        <FormattedMessage
          id="circuit.output.n"
          defaultMessage="Output {number}"
          values={{number: ii}}
        />
      ),
    };
  }
  return outputs;
}

function createElementInputs(
  idTree: IdTreeNode,
  data: Object,
): {[string]: InputData} {
  const inputs = {};
  const elementCount = data.elements || ElementsProperty.elements.defaultValue;
  for (let ii = 1; ii <= elementCount; ii++) {
    inputs['input' + ii] = createElement(ii);
  }
  return inputs;
}

function createElementOutputs(
  idTree: IdTreeNode,
  data: Object,
): {[string]: OutputData} {
  const outputs = {};
  const elementCount = data.elements || ElementsProperty.elements.defaultValue;
  for (let ii = 1; ii <= elementCount; ii++) {
    outputs['output' + ii] = createElement(ii);
  }
  return outputs;
}

function createElement(index: number) {
  return {
    label: (
      <FormattedMessage
        id="circuit.element.n"
        defaultMessage="Element {number}"
        values={{number: index}}
      />
    ),
  };
}
