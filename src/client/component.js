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
  CardHeader,
  CardBody,
  Container,
  Row,
  Col,
  Button,
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  CustomInput,
} from 'reactstrap';
import type {EditorTab} from './store';
import {StoreActions, store} from './store';
import {EntityName} from './entity';
import {
  Menu,
  Submenu,
  MenuItem,
  ButtonMenu,
  NumberField,
  ColorField,
  renderText,
} from './util/ui';
import {GeometryCategory, GeometryComponents} from './geometry/components';
import {RendererCategory, RendererComponents} from './renderer/components';
import {PhysicsCategory, PhysicsComponents} from './physics/components';
import type {Resource, Entity} from '../server/store/resource';
import {Scene, SceneActions} from '../server/store/scene';
import {radians, degrees, roundToPrecision, vec2} from '../server/store/math';
import {getValue} from '../server/store/util';

/**
 * The component menu dropdown.
 */
export class ComponentDropdown extends React.Component<{}, {}> {
  render() {
    return (
      <Menu
        label={
          <FormattedMessage id="component.title" defaultMessage="Component" />
        }
        omitChildrenWhenClosed={true}>
        <CategorySubmenus />
      </Menu>
    );
  }
}

function CategorySubmenus() {
  const state = store.getState();
  const resource = state.resource;
  if (!resource) {
    return null;
  }
  const page = state.editorTab === 'page';
  const categories: Map<string, [string, ComponentData][]> = new Map();
  for (const name in Components) {
    const data = Components[name];
    const category = data.category;
    if (category && (page ? data.page === true : data.entity !== false)) {
      let array = categories.get(category);
      if (!array) {
        categories.set(category, (array = []));
      }
      array.push([name, data]);
    }
  }
  const ids = page ? [state.page] : state.selection;
  const entities: Entity[] = [];
  for (const id of ids) {
    const entity = resource.getEntity(id);
    entity && entities.push(entity);
  }
  return Object.entries(Categories).map(([name, data]) => {
    const array = categories.get(name);
    if (!array) {
      return null;
    }
    return (
      <Submenu
        key={name}
        label={(data: any).label}
        disabled={entities.length === 0}>
        {array.map(([name, data]) => (
          <MenuItem
            key={name}
            onClick={() => {
              const map = {};
              for (const entity of entities) {
                let highestOrder = 0;
                for (const key in entity.state) {
                  highestOrder = Math.max(
                    highestOrder,
                    entity.state[key].order || 0,
                  );
                }
                map[entity.id] = {[name]: {order: highestOrder + 1}};
              }
              store.dispatch(SceneActions.editEntities.create(map));
            }}>
            {data.label}
          </MenuItem>
        ))}
      </Submenu>
    );
  });
}

/**
 * The component editor.
 */
export const ComponentEditor = ReactRedux.connect(state => ({
  editorTab: state.editorTab,
  resource: state.resource,
  entityIds: state.editorTab === 'entity' ? state.selection : state.page,
  draggingComponent: state.draggingComponent,
}))(
  (props: {
    locale: string,
    editorTab: EditorTab,
    resource: ?Resource,
    entityIds: string | Set<string>,
    draggingComponent: ?string,
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
          draggingComponent={props.draggingComponent}
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
  draggingComponent: ?string,
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
  let previousOrder: number = 0;
  let highestOrder: number = 0;
  if (intersection) {
    components = (Object.entries(intersection): [string, any][]).filter(
      ([key, value]) => Components[key],
    );
    // special handling for our built-in components
    const automaticComponent = props.page ? 'background' : 'transform';
    if (!intersection[automaticComponent]) {
      components.unshift([automaticComponent, {}]);
    }
    if (components.length > 0) {
      components.sort(
        ([keyA, valueA], [keyB, valueB]) =>
          (valueA.order || 0) - (valueB.order || 0),
      );
      previousOrder = (components[0][1].order || 0) - 2;
      highestOrder = components[components.length - 1][1].order || 0;
    }
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
        {components.map(([key, value]) => {
          const componentOrder = value.order || 0;
          const preOrder = (previousOrder + componentOrder) / 2;
          previousOrder = componentOrder;
          return (
            <ComponentPanel
              key={key}
              id={key}
              value={value}
              editEntities={editEntities}
              draggingComponent={props.draggingComponent}
              components={components}
              preOrder={preOrder}
              postOrder={
                componentOrder === highestOrder ? highestOrder + 1 : null
              }
            />
          );
        })}
      </Form>
      {props.entities.length > 0 ? (
        <ButtonMenu
          label={
            <FormattedMessage
              id="component.add"
              defaultMessage="Add Component"
            />
          }
          direction="left"
          omitChildrenWhenClosed={true}>
          <CategorySubmenus />
        </ButtonMenu>
      ) : null}
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
  draggingComponent: ?string,
  components: [string, any][],
  preOrder: number,
  postOrder: ?number,
}) {
  const component = Components[props.id];
  if (!component) {
    return null;
  }
  return (
    <Card className="mb-3">
      {props.draggingComponent ? (
        <ReorderTarget
          draggingComponent={props.draggingComponent}
          components={props.components}
          order={props.preOrder}
          editEntities={props.editEntities}
        />
      ) : null}
      <CardHeader
        className="p-2 unselectable"
        draggable
        onDragStart={event => {
          event.dataTransfer.setData('text', props.id);
          store.dispatch(StoreActions.setDraggingComponent.create(props.id));
        }}
        onDragEnd={event => {
          store.dispatch(StoreActions.setDraggingComponent.create(null));
        }}>
        {component.label}
        {component.removable !== false ? (
          <Button
            className="close float-right"
            onClick={() => props.editEntities({[props.id]: null})}>
            &times;
          </Button>
        ) : null}
      </CardHeader>
      <CardBody className="p-2">
        <PropertyEditorGroup
          properties={component.properties}
          values={props.value}
          setValue={(key, value) =>
            props.editEntities({[props.id]: {[key]: value}})
          }
        />
      </CardBody>
      {props.draggingComponent && props.postOrder != null ? (
        <ReorderTarget
          draggingComponent={props.draggingComponent}
          components={props.components}
          after={true}
          order={props.postOrder}
          editEntities={props.editEntities}
        />
      ) : null}
    </Card>
  );
}

/**
 * Component for editing the properties of an object.
 *
 * @param props the element properties.
 * @param props.properties the property metadata.
 * @param [props.labelSize=4] the number of columns (out of 12) to use for the
 * label.
 * @param [props.padding=true] whether or not to use padding between the
 * columns.
 * @param [props.rightAlign=false] whether or not to right-align editors.
 * @param props.values the object containing the values.
 * @param props.setValue the function to set a value.
 * @return an array containing the editor elements.
 */
export function PropertyEditorGroup(props: {
  properties: {[string]: PropertyData},
  labelSize?: number,
  padding?: boolean,
  rightAlign?: boolean,
  values: any,
  setValue: (string, any) => void,
}) {
  const labelSize = props.labelSize || 4;
  const properties: [string, PropertyData][] = (Object.entries(
    props.properties,
  ): [string, any][]);
  return properties.map(([key, property]) => {
    const PropertyEditor = PropertyEditors[property.type];
    return (
      <FormGroup key={key} className="mb-1" row>
        <Label
          for={key}
          className={`unselectable${props.padding === false ? ' pr-0' : ''}`}
          sm={labelSize}>
          {property.label}
        </Label>
        <PropertyEditor
          id={key}
          property={property}
          sm={12 - labelSize}
          classSuffix={props.padding === false ? ' pl-0' : ''}
          rightAlign={props.rightAlign}
          value={props.values[key]}
          setValue={value => props.setValue(key, value)}
        />
      </FormGroup>
    );
  });
}

function ReorderTarget(props: {
  draggingComponent: string,
  components: [string, any][],
  after?: boolean,
  order: number,
  editEntities: Object => void,
}) {
  if (!isDroppable(props.draggingComponent, props.components, props.order)) {
    return null;
  }
  const baseClass = `component-reorder-target${
    props.after ? ' after' : ' before'
  }`;
  return (
    <div
      className={baseClass}
      onDragEnter={event => {
        event.target.className = baseClass + ' visible';
      }}
      onDragLeave={event => {
        event.target.className = baseClass;
      }}
      onDrop={event => {
        event.target.className = baseClass;
        props.editEntities({[props.draggingComponent]: {order: props.order}});
      }}
    />
  );
}

function isDroppable(
  draggingComponent: string,
  components: [string, any][],
  order: number,
): boolean {
  let previousKey: ?string;
  for (const [key, value] of components) {
    const componentOrder = value.order || 0;
    if (order < componentOrder) {
      return draggingComponent !== key && draggingComponent !== previousKey;
    }
    previousKey = key;
  }
  return draggingComponent !== previousKey;
}

const PropertyEditors = {
  boolean: (props: {
    id: string,
    property: PropertyData,
    sm: number,
    classSuffix: string,
    rightAlign: ?boolean,
    value: ?boolean,
    setValue: boolean => void,
  }) => {
    return (
      <div className={`col-sm-${props.sm}${props.classSuffix}`}>
        <CustomInput
          id={props.id}
          type="checkbox"
          className={props.rightAlign ? 'text-right' : undefined}
          cssModule={{'custom-control-label': 'custom-control-label mb-2'}}
          checked={getValue(
            props.value,
            props.property.defaultValue || DefaultValues.boolean,
          )}
          onChange={event => props.setValue(event.target.checked)}
        />
      </div>
    );
  },
  number: (props: {
    id: string,
    property: PropertyData,
    sm: number,
    classSuffix: string,
    rightAlign: ?boolean,
    value: ?number,
    setValue: number => void,
  }) => {
    return (
      <div className={`col-sm-${props.sm}${props.classSuffix}`}>
        <NumberField
          id={props.id}
          initialValue={getValue(
            props.value,
            props.property.defaultValue || DefaultValues.number,
          )}
          setValue={value => props.setValue(value)}
          step={props.property.step}
          wheelStep={props.property.wheelStep}
          precision={props.property.precision}
          circular={props.property.circular}
          min={props.property.min}
          max={props.property.max}
        />
      </div>
    );
  },
  color: (props: {
    id: string,
    property: PropertyData,
    sm: number,
    classSuffix: string,
    rightAlign: ?boolean,
    value: ?string,
    setValue: string => void,
  }) => {
    return (
      <div className={`col-sm-${props.sm}${props.classSuffix}`}>
        <ColorField
          id={props.id}
          initialValue={props.value}
          defaultValue={props.property.defaultValue || DefaultValues.color}
          setValue={props.setValue}
        />
      </div>
    );
  },
  angle: (props: {
    id: string,
    property: PropertyData,
    sm: number,
    classSuffix: string,
    rightAlign: ?boolean,
    value: ?number,
    setValue: number => void,
  }) => {
    return (
      <div className={`col-sm-${props.sm}${props.classSuffix}`}>
        <NumberField
          id={props.id}
          initialValue={degrees(
            getValue(
              props.value,
              props.property.defaultValue || DefaultValues.angle,
            ),
          )}
          setValue={value => props.setValue(radians(value))}
          precision={2}
          min={degrees(getValue(props.property.min, -Math.PI))}
          max={degrees(getValue(props.property.max, Math.PI))}
          circular={true}
        />
      </div>
    );
  },
  vector: (props: {
    id: string,
    property: PropertyData,
    sm: number,
    classSuffix: string,
    rightAlign: ?boolean,
    value: ?Object,
    setValue: Object => void,
  }) => {
    const vector =
      props.value || props.property.defaultValue || DefaultValues.vector;
    const halfSm = props.sm / 2;
    return [
      <VectorComponent
        key="x"
        className={`col-sm-${halfSm} pr-1${props.classSuffix}`}
        name="x"
        vector={vector}
        setVector={props.setValue}
      />,
      <VectorComponent
        key="y"
        className={`col-sm-${halfSm} pl-0`}
        name="y"
        vector={vector}
        setVector={props.setValue}
      />,
    ];
  },
  array: (props: {
    id: string,
    property: PropertyData,
    sm: number,
    classSuffix: string,
    rightAlign: ?boolean,
    value: ?Array<any>,
    setValue: (Array<any>) => void,
  }) => {
    const elementProperty = props.property.elements;
    const PropertyEditor = PropertyEditors[elementProperty.type];
    const array =
      props.value || props.property.defaultValue || DefaultValues.array;
    return (
      <Container className={`col-sm-${props.sm}${props.classSuffix}`}>
        {array.map((value, index) => (
          <Row key={index} className="mb-1">
            <PropertyEditor
              property={elementProperty}
              sm={12}
              classSuffix={props.classSuffix}
              rightAlign={props.rightAlign}
              value={value}
              setValue={value => {
                const newArray = array.slice();
                newArray[index] = value;
                props.setValue(newArray);
              }}
            />
          </Row>
        ))}
        <Row>
          <Col sm={6} className="pr-1">
            <Button
              className="w-100"
              onClick={() => {
                const newArray = array.slice();
                newArray.push(
                  elementProperty.defaultValue == null
                    ? DefaultValues[elementProperty.type]
                    : elementProperty.defaultValue,
                );
                props.setValue(newArray);
              }}>
              <FormattedMessage id="array.add" defaultMessage="Add" />
            </Button>
          </Col>
          <Col sm={6} className="pl-0">
            <Button
              className="w-100"
              disabled={array.length === 0}
              onClick={() => {
                props.setValue(array.slice(0, array.length - 1));
              }}>
              <FormattedMessage id="array.remove" defaultMessage="Remove" />
            </Button>
          </Col>
        </Row>
      </Container>
    );
  },
};

const DefaultValues = {
  boolean: false,
  number: 0,
  color: '#000000',
  angle: 0,
  vector: vec2(),
  array: [],
};

function VectorComponent(props: {
  className: string,
  name: string,
  vector: Object,
  setVector: Object => void,
}) {
  return (
    <div className={props.className}>
      <NumberField
        initialValue={props.vector[props.name]}
        setValue={value =>
          props.setVector(
            Object.assign({}, props.vector, {[props.name]: value}),
          )
        }
        step={0.01}
        wheelStep={0.1}
        precision={2}
      />
    </div>
  );
}

export type PropertyData = {
  type: $Keys<typeof PropertyEditors>,
  label: React.Element<any>,
  [string]: any,
};

export type ComponentData = {
  label: React.Element<any>,
  properties: {[string]: PropertyData},
  removable?: boolean,
  category?: string,
  page?: boolean,
  entity?: boolean,
  [string]: any,
};

const Components: {[string]: ComponentData} = {
  transform: {
    label: <FormattedMessage id="transform.title" defaultMessage="Transform" />,
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
        type: 'angle',
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
        defaultValue: vec2(1.0, 1.0),
      },
    },
    removable: false,
  },
  ...GeometryComponents,
  ...RendererComponents,
  ...PhysicsComponents,
};

export type CategoryData = {
  label: React.Element<any>,
};

const Categories: {[string]: CategoryData} = {
  ...GeometryCategory,
  ...RendererCategory,
  ...PhysicsCategory,
};
