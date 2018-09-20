/**
 * UI components related to entity components.
 *
 * @module client/component
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {
  Nav,
  NavItem,
  NavLink,
  Form,
  FormGroup,
  Label,
  Input,
  Card,
  Button,
} from 'reactstrap';
import type {EditorTab} from './store';
import {StoreActions, store} from './store';
import {EntityName} from './entity';
import {radians, degrees, normalizeAngle, roundToPrecision} from './util/math';
import {Menu, renderText} from './util/ui';
import type {Resource, Entity} from '../server/store/resource';
import {Scene, SceneActions} from '../server/store/scene';

/**
 * The component menu dropdown.
 */
export class ComponentDropdown extends React.Component<
  {},
  {dialog: ?React.Element<any>},
> {
  state = {dialog: null};

  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="component.title" defaultMessage="Component" />
        }>
        {this.state.dialog}
      </Menu>
    );
  }
}

/**
 * The component editor.
 */
export const ComponentEditor = ReactRedux.connect(state => ({
  editorTab: state.editorTab,
  resource: state.resource,
  entityIds: state.editorTab === 'entity' ? state.selection : state.page,
}))(
  (props: {
    locale: string,
    editorTab: EditorTab,
    resource: ?Resource,
    entityIds: string | Set<string>,
  }) => {
    const resource = props.resource;
    if (!(resource instanceof Scene)) {
      return null; // shouldn't happen
    }
    const entities: Entity[] = [];
    if (typeof props.entityIds === 'string') {
      const entity = resource.getEntity(props.entityIds);
      entity && entities.push(entity);
    } else {
      for (const entityId of props.entityIds) {
        const entity = resource.getEntity(entityId);
        entity && entities.push(entity);
      }
    }
    const page = props.editorTab === 'page';
    return (
      <div className="component-editor">
        <Nav tabs className="pt-2 bg-black">
          <NavItem>
            <NavLink
              active={!page}
              onClick={() =>
                store.dispatch(StoreActions.setEditorTab.create('entity'))
              }>
              <FormattedMessage id="editor.entity" defaultMessage="Entities" />
            </NavLink>
          </NavItem>
          <NavItem>
            <NavLink
              active={page}
              onClick={() =>
                store.dispatch(StoreActions.setEditorTab.create('page'))
              }>
              <FormattedMessage id="editor.page" defaultMessage="Page" />
            </NavLink>
          </NavItem>
        </Nav>
        <EntityEditor
          locale={props.locale}
          resource={resource}
          entities={entities}
          page={page}
        />
      </div>
    );
  },
);

function EntityEditor(props: {
  locale: string,
  resource: Scene,
  entities: Entity[],
  page: boolean,
}) {
  // get intersection state
  let original: ?Object;
  let intersection: ?Object;
  for (const entity of props.entities) {
    if (!(original && intersection)) {
      original = entity.state;
      intersection = entity.state;
    } else {
      intersection = intersectState(original, intersection, entity.state);
    }
  }
  let components: [string, any][] = [];
  if (intersection) {
    components = (Object.entries(intersection): [string, any][]);
    if (!(intersection.transform || props.page)) {
      components.unshift(['transform', {}]);
    }
    components.sort(
      ([keyA, valueA], [keyB, valueB]) =>
        (valueA.order || 0) - (valueB.order || 0),
    );
  }
  const editEntities = (values: Object) => {
    const map = {};
    for (const entity of props.entities) {
      map[entity.id] = values;
    }
    store.dispatch(SceneActions.editEntities.create(map));
  };
  return (
    <div className="entity-editor border-left border-secondary flex-grow-1 p-2">
      <Form>
        <NameEditor
          locale={props.locale}
          resource={props.resource}
          entities={props.entities}
          editEntities={editEntities}
        />
        {components.map(([key, value]) => (
          <ComponentPanel
            key={key}
            id={key}
            value={value}
            editEntities={editEntities}
          />
        ))}
      </Form>
    </div>
  );
}

function intersectState(
  original: Object,
  intersection: Object,
  state: Object,
): Object {
  let newIntersection = intersection;
  for (const key in intersection) {
    const intersectionValue = intersection[key];
    const stateValue = state[key];
    if (intersectionValue === stateValue) {
      continue;
    }
    if (newIntersection === original) {
      newIntersection = Object.assign({}, original);
    }
    if (
      typeof intersectionValue === 'object' &&
      typeof stateValue === 'object' &&
      intersectionValue !== null &&
      stateValue !== null
    ) {
      newIntersection[key] = intersectState(
        original[key],
        intersectionValue,
        stateValue,
      );
    } else {
      delete newIntersection[key];
    }
  }
  return newIntersection;
}

function NameEditor(props: {
  locale: string,
  resource: Scene,
  entities: Entity[],
  editEntities: Object => void,
}) {
  if (props.entities.length === 0) {
    return null;
  }
  let name: ?string;
  let editable = true;
  for (const entity of props.entities) {
    editable = editable && !props.resource.isInitialEntity(entity.id);
    if (name === undefined) {
      name = entity.getName();
    } else if (name !== entity.getName()) {
      name = '';
    }
  }
  if (!editable && props.entities.length === 1) {
    name = renderText(<EntityName entity={props.entities[0]} />, props.locale);
  }
  return (
    <FormGroup row>
      <div className="col-sm-12">
        <Input
          id="name"
          disabled={!editable}
          value={name || ''}
          maxLength={255}
          onChange={event => props.editEntities({name: event.target.value})}
        />
      </div>
    </FormGroup>
  );
}

function ComponentPanel(props: {
  id: string,
  value: any,
  editEntities: Object => void,
}) {
  const component = Components[props.id];
  if (!component) {
    return null;
  }
  const properties: [string, PropertyData][] = (Object.entries(
    component.properties,
  ): [string, any][]);
  return (
    <Card
      className="p-1"
      body={true}
      draggable
      onDragStart={event => {
        event.dataTransfer.setData('text', props.id);
      }}>
      {properties.map(([key, property]) => {
        const PropertyEditor = PropertyEditors[property.type];
        return (
          <FormGroup key={key} className="mb-0" row>
            <Label for={key} className="text-left pr-0" sm={4}>
              {property.label}
            </Label>
            <PropertyEditor
              id={key}
              value={props.value[key]}
              setValue={value => {
                props.editEntities({[props.id]: {[key]: value}});
              }}
            />
          </FormGroup>
        );
      })}
      {component.removable !== false ? (
        <Button
          className="close remove-component"
          onClick={() => props.editEntities({[props.id]: null})}>
          &times;
        </Button>
      ) : null}
    </Card>
  );
}

const PropertyEditors = {
  vector: (props: {id: string, value: ?Object, setValue: Object => void}) => {
    const vector = props.value || {x: 0.0, y: 0.0};
    const setValue = props.setValue;
    const VectorComponent = (props: {className: string, name: string}) => (
      <div className={props.className}>
        <NumberField
          value={vector[props.name]}
          setValue={value =>
            setValue(Object.assign({}, vector, {[props.name]: value}))
          }
          step={0.01}
          precision={2}
        />
      </div>
    );
    return [
      <VectorComponent key="x" className="col-sm-4 pr-1" name="x" />,
      <VectorComponent key="y" className="col-sm-4 pl-0" name="y" />,
    ];
  },
  rotation: (props: {id: string, value: ?number, setValue: number => void}) => {
    return (
      <div className="col-sm-8">
        <Input
          id={props.id}
          type="number"
          value={roundToPrecision(degrees(props.value || 0), 2)}
          max={180}
          min={-180}
          onChange={event => {
            const value = parseFloat(event.target.value);
            isNaN(value) || props.setValue(radians(value));
          }}
          onWheel={event => {
            if (event.deltaY === 0) {
              return;
            }
            event.preventDefault();
            const delta = event.deltaY > 0 ? -1 : 1;
            const value = parseFloat(event.target.value) + delta;
            props.setValue(normalizeAngle(radians(value)));
          }}
        />
      </div>
    );
  },
};

function NumberField(props: {
  value: ?number,
  setValue: number => void,
  step: number,
  precision: number,
}) {
  return (
    <Input
      type="number"
      value={roundToPrecision(props.value || 0, props.precision)}
      step={props.step}
      onChange={event => {
        const value = parseFloat(event.target.value);
        isNaN(value) || props.setValue(value);
      }}
      onWheel={event => {
        if (event.deltaY === 0) {
          return;
        }
        event.preventDefault();
        const delta = event.deltaY > 0 ? -props.step : props.step;
        const value = parseFloat(event.target.value) + delta;
        props.setValue(value);
      }}
    />
  );
}

type PropertyData = {
  type: $Keys<typeof PropertyEditors>,
  label: React.Element<any>,
};

type ComponentData = {
  properties: {[string]: PropertyData},
  removable?: boolean,
};

const Components: {[string]: ComponentData} = {
  transform: {
    properties: {
      translation: {
        type: 'vector',
        label: (
          <FormattedMessage
            id="transform.translation"
            defaultMessage="Translation:"
          />
        ),
      },
      rotation: {
        type: 'rotation',
        label: (
          <FormattedMessage
            id="transform.rotation"
            defaultMessage="Rotation:"
          />
        ),
      },
      scale: {
        type: 'vector',
        label: (
          <FormattedMessage id="transform.scale" defaultMessage="Scale:" />
        ),
      },
    },
    removable: false,
  },
};
