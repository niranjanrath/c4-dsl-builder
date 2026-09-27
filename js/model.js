// model.js — the architecture model is the single source of truth.
// The wizard writes into this structure; validation and DSL generation only ever read from it.

let idCounter = 1;
export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

export function defaultStyleColors() {
  return {
    person: '#08427b',
    internalSystem: '#1168bd',
    externalSystem: '#999999',
    container: '#438dd5',
    component: '#85bbf0'
  };
}

// Projects saved before element coloring existed won't have `styles` yet — patch it in
// on load so older projects don't break when opening Settings or generating DSL.
export function ensureStyles(model) {
  if (!model.styles || !model.styles.defaults) {
    model.styles = { defaults: defaultStyleColors() };
  }
  return model;
}

export function createEmptyModel(name = 'Untitled Project') {
  return {
    meta: {
      id: newId('proj'),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    workspace: {
      name: name,
      description: '',
      author: '',
      tags: ''
    },
    styles: { defaults: defaultStyleColors() },
    people: [],            // { id, name, description, tags, color }
    softwareSystems: [],   // { id, name, description, type: 'Internal'|'External', technology, tags, color }
    relationships: [],     // { id, sourceId, targetId, description, technology, tags } (source/target: person or softwareSystem id)
    containers: [],        // { id, systemId, name, description, technology, tags, color }
    containerRelationships: [], // { id, sourceId, targetId, description, technology, tags } (container ids)
    components: [],        // { id, containerId, name, description, technology, tags, color }
    componentRelationships: [], // { id, sourceId, targetId, description, technology }
    scenarios: [],         // { id, name, description, steps: [{ id, sourceId, targetId, description }] }
                            //   step source/target: person, softwareSystem, container, or component id
    deployment: {
      enabled: false,
      environments: [] // { id, name, nodes: [{ id, name, technology, instances: [{ id, refId, refType }] }] }
    },
    views: {
      systemLandscape: true,
      systemContext: true,
      container: true,
      component: false,
      dynamic: true,
      deployment: false
    }
  };
}

// Every element that can be referenced as a relationship endpoint, tagged with its kind.
export function allReferenceableElements(model) {
  const list = [];
  model.people.forEach(p => list.push({ id: p.id, name: p.name, kind: 'person' }));
  model.softwareSystems.forEach(s => list.push({ id: s.id, name: s.name, kind: 'softwareSystem' }));
  return list;
}

export function allContainerElements(model) {
  return model.containers.map(c => ({ id: c.id, name: c.name, kind: 'container', systemId: c.systemId }));
}

export function allComponentElements(model) {
  return model.components.map(c => ({ id: c.id, name: c.name, kind: 'component', containerId: c.containerId }));
}

// Union of everything a dynamic scenario step could point at.
export function allScenarioReferenceable(model) {
  return [
    ...allReferenceableElements(model),
    ...allContainerElements(model),
    ...allComponentElements(model)
  ];
}

export function findElementName(model, id) {
  const all = [
    ...allReferenceableElements(model),
    ...allContainerElements(model),
    ...allComponentElements(model)
  ];
  const found = all.find(e => e.id === id);
  return found ? found.name : '(unknown)';
}

export function touch(model) {
  model.meta.updatedAt = new Date().toISOString();
}
