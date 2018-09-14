/**
 * UI components related to entity components.
 *
 * @module client/component
 * @flow
 */

import * as React from 'react';
import * as ReactRedux from 'react-redux';
import {FormattedMessage} from 'react-intl';
import {Nav, NavItem, NavLink, Form, FormGroup, Label, Input} from 'reactstrap';
import type {EditorTab} from './store';
import {StoreActions, store} from './store';
import {EntityName} from './entity';
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
    return (
      <div className="component-editor">
        <Nav tabs className="pt-1 bg-black">
          <NavItem>
            <NavLink
              active={props.editorTab === 'entity'}
              onClick={() =>
                store.dispatch(StoreActions.setEditorTab.create('entity'))
              }>
              <FormattedMessage id="editor.entity" defaultMessage="Entity" />
            </NavLink>
          </NavItem>
          <NavItem>
            <NavLink
              active={props.editorTab === 'page'}
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
        />
      </div>
    );
  },
);

function EntityEditor(props: {
  locale: string,
  resource: Scene,
  entities: Entity[],
}) {
  return (
    <div className="border-left border-secondary flex-grow-1 p-2">
      <Form>
        <NameEditor
          locale={props.locale}
          resource={props.resource}
          entities={props.entities}
        />
      </Form>
    </div>
  );
}

function NameEditor(props: {
  locale: string,
  resource: Scene,
  entities: Entity[],
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
          onChange={event => {
            const map = {};
            const name = event.target.value;
            for (const entity of props.entities) {
              map[entity.id] = {name};
            }
            store.dispatch(SceneActions.editEntities.create(map));
          }}
        />
      </div>
    </FormGroup>
  );
}
