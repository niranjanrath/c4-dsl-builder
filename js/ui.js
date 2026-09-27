// ui.js — all DOM rendering. Talks to the model via plain object mutation + db.saveModel().
// Never generates DSL directly; that only ever happens in dsl-generator.js from the stored model.

import { STEPS, HELP } from './questions.js';
import { newId, allReferenceableElements, allContainerElements, allComponentElements, allScenarioReferenceable, findElementName, touch } from './model.js';
import { validateModel } from './validation.js';
import { generateDsl } from './dsl-generator.js';
import { saveModel } from './db.js';

const root = document.getElementById('app-root');
let currentModel = null;
let currentStepIndex = 0;
let onDashboardReturn = null;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined) return; // skip — setAttribute(k, null) would stringify to "null" and e.g. wrongly disable buttons
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function icon(letter) { return letter; }

async function persist() {
  touch(currentModel);
  await saveModel(currentModel);
}

// ---------- Help popover helper ----------
function fieldLabel(text, helpKey) {
  const label = el('label', {}, text);
  if (helpKey && HELP[helpKey]) {
    const info = el('span', { class: 'info-icon', title: 'Help' }, 'i');
    label.appendChild(info);
    return { label, helpKey };
  }
  return { label, helpKey: null };
}

function buildField({ id, type = 'text', label, helpKey, value = '', options = null, textarea = false }) {
  const wrap = el('div', { class: 'field' });
  const labelRow = el('label', {}, label);
  if (helpKey && HELP[helpKey]) {
    const info = el('span', { class: 'info-icon' }, 'i');
    labelRow.appendChild(info);
    wrap.appendChild(labelRow);
    const pop = el('div', { class: 'help-popover' }, [
      el('div', {}, HELP[helpKey].means),
      el('div', { class: 'example-label' }, 'Example'),
      el('div', { class: 'example-text' }, `"${HELP[helpKey].example}"`)
    ]);
    wrap.appendChild(pop);
    info.addEventListener('click', () => pop.classList.toggle('open'));
  } else {
    wrap.appendChild(labelRow);
  }

  let input;
  if (options) {
    input = el('select', { id });
    options.forEach(opt => {
      const o = el('option', { value: opt.value }, opt.label);
      if (opt.value === value) o.setAttribute('selected', 'selected');
      input.appendChild(o);
    });
  } else if (textarea) {
    input = el('textarea', { id });
    input.value = value;
  } else {
    input = el('input', { id, type: 'text' });
    input.value = value;
  }
  wrap.appendChild(input);
  return { wrap, input };
}

// ---------- Modal form ----------
function openModal(title, fieldConfigs, initialValues, onSubmit) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const inputs = {};
  const fieldNodes = fieldConfigs.map(cfg => {
    const { wrap, input } = buildField({ ...cfg, value: initialValues[cfg.id] ?? cfg.default ?? '' });
    inputs[cfg.id] = input;
    return wrap;
  });
  const modal = el('div', { class: 'modal' }, [
    el('h3', {}, title),
    ...fieldNodes,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', onclick: () => backdrop.remove() }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: async () => {
          const values = {};
          Object.entries(inputs).forEach(([k, node]) => (values[k] = node.value.trim()));
          await onSubmit(values);
          backdrop.remove();
        }
      }, 'Save')
    ])
  ]);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

function confirmDelete(message, onConfirm) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: 'modal modal-confirm' }, [
    el('h3', {}, 'Confirm Delete'),
    el('p', { class: 'modal-message' }, message),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', onclick: () => backdrop.remove() }, 'Cancel'),
      el('button', {
        class: 'btn btn-danger-solid',
        onclick: () => { backdrop.remove(); onConfirm(); }
      }, 'Delete')
    ])
  ]);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

// ---------- Toast notifications (replaces native alert()/confirm() popups) ----------
let toastContainer = null;
function toast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = el('div', { class: 'toast-container' });
    document.body.appendChild(toastContainer);
  }
  const node = el('div', { class: `toast toast-${type}` }, message);
  toastContainer.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 200);
  }, 2800);
}


// ---------- Dashboard ----------
export async function renderDashboard(projects, handlers) {
  root.innerHTML = '';
  const rows = projects.map(p => el('tr', { onclick: () => handlers.open(p.id) }, [
    el('td', { 'data-label': 'Name' }, p.name),
    el('td', { 'data-label': 'Last Updated' }, new Date(p.updatedAt).toLocaleDateString()),
    el('td', { 'data-label': 'Description' }, p.description || ''),
    el('td', { 'data-label': '' }, el('button', {
      class: 'btn btn-icon btn-danger',
      onclick: (e) => { e.stopPropagation(); confirmDelete(`Delete project "${p.name}"? This cannot be undone.`, () => handlers.remove(p.id)); }
    }, 'Delete'))
  ]));

  const dash = el('div', { class: 'dashboard' }, [
    el('h1', {}, 'Project Dashboard'),
    el('div', { class: 'subtitle' }, 'Manage your architecture projects stored locally in IndexedDB.'),
    el('div', { class: 'dashboard-toolbar' }, [
      el('input', { class: 'search-input', placeholder: 'Search projects...' }),
      el('button', { class: 'btn btn-primary', onclick: handlers.create }, '+ New Project')
    ]),
    projects.length === 0
      ? el('div', { class: 'card empty-state' }, 'No projects yet. Create one to get started.')
      : el('table', { class: 'project-table' }, [
          el('thead', {}, el('tr', {}, [el('th', {}, 'Name'), el('th', {}, 'Last Updated'), el('th', {}, 'Description'), el('th', {}, '')])),
          el('tbody', {}, rows)
        ])
  ]);
  root.appendChild(el('div', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [el('div', { class: 'logo' }, 'C4'), 'C4 DSL Builder']),
    el('div', { class: 'status' }, '')
  ]));
  root.appendChild(dash);
}

export function newProjectModal(onCreate) {
  openModal('Create New Project', [
    { id: 'name', label: 'Project Name *' },
    { id: 'description', label: 'Description', textarea: true },
    { id: 'author', label: 'Author (optional)' },
    { id: 'tags', label: 'Tags (comma separated, optional)' }
  ], {}, async (values) => {
    if (!values.name) { toast('Project name is required.', 'error'); return; }
    onCreate(values);
  });
}

// A step's "done" checkmark reflects whether the model actually has data for it —
// not just whether the wizard has scrolled past its index — so reopening a saved
// project shows the correct progress immediately, before any navigation happens.
function stepIsComplete(model, key) {
  switch (key) {
    case 'workspace': return !!(model.workspace.name && model.workspace.description);
    case 'people': return model.people.length > 0;
    case 'softwareSystems': return model.softwareSystems.length > 0;
    case 'relationships': return model.relationships.length > 0;
    case 'containers': return model.containers.length > 0;
    case 'containerRelationships': return model.containerRelationships.length > 0;
    case 'components': return model.components.length > 0;
    case 'componentRelationships': return model.componentRelationships.length > 0;
    case 'scenarios': return model.scenarios.length > 0;
    case 'deployment': return model.deployment.enabled && model.deployment.environments.length > 0;
    case 'views': return Object.values(model.views).some(Boolean);
    default: return false; // 'validate' is the destination, never shown as "done"
  }
}

// ---------- Wizard shell ----------
export function renderWizard(model, stepIndex, onNavigate) {
  currentModel = model;
  currentStepIndex = stepIndex;
  root.innerHTML = '';

  root.appendChild(el('div', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'logo' }, 'C4'),
      'C4 DSL Builder',
      el('span', { class: 'crumb' }, ` / ${model.workspace.name || 'Untitled'}`)
    ]),
    el('div', { class: 'status' }, [
      el('button', { class: 'btn', onclick: () => onNavigate(-2) }, '← All Projects')
    ])
  ]));

  const sidebar = el('div', { class: 'sidebar' }, STEPS.map((s, i) => {
    const done = stepIsComplete(model, s.key);
    const cls = 'step-item' + (i === stepIndex ? ' active' : '') + (done ? ' done' : '');
    return el('div', { class: cls, onclick: () => onNavigate(i) }, [
      el('div', { class: 'num' }, done ? '✓' : String(s.number)),
      s.title
    ]);
  }));

  const content = el('div', { class: 'content', id: 'wizard-content' });
  const layout = el('div', { class: 'wizard-layout' }, [sidebar, content]);
  root.appendChild(layout);

  renderStepBody(content, model, stepIndex, onNavigate);
}

function stepHeader(content, step, index) {
  content.appendChild(el('div', { class: 'progressbar' }, el('div', { style: `width:${((index + 1) / STEPS.length) * 100}%` })));
  content.appendChild(el('h2', {}, `${step.number}. ${step.title}`));
  content.appendChild(el('div', { class: 'step-sub' }, step.short));
}

function navButtons(content, index, onNavigate, { nextDisabled = false, nextLabel = 'Continue →', onNext = null } = {}) {
  const nav = el('div', { class: 'wizard-nav' }, [
    el('button', { class: 'btn', disabled: index === 0 ? 'disabled' : null, onclick: () => index > 0 && onNavigate(index - 1) }, '← Back'),
    el('button', {
      class: 'btn btn-primary',
      onclick: () => {
        if (nextDisabled) return;
        if (onNext) onNext();
        else onNavigate(Math.min(index + 1, STEPS.length - 1));
      }
    }, nextLabel)
  ]);
  content.appendChild(nav);
}

function renderStepBody(content, model, index, onNavigate) {
  const step = STEPS[index];
  stepHeader(content, step, index);

  const renderers = {
    workspace: renderWorkspaceStep,
    people: renderPeopleStep,
    softwareSystems: renderSystemsStep,
    relationships: renderRelationshipsStep,
    containers: renderContainersStep,
    containerRelationships: renderContainerRelationshipsStep,
    components: renderComponentsStep,
    componentRelationships: renderComponentRelationshipsStep,
    scenarios: renderScenariosStep,
    deployment: renderDeploymentStep,
    views: renderViewsStep,
    validate: renderValidateStep
  };
  renderers[step.key](content, model, index, onNavigate);
}

// ---------- Step 1: Workspace ----------
function renderWorkspaceStep(content, model, index, onNavigate) {
  const card = el('div', { class: 'card' });
  const fields = [
    buildField({ id: 'wname', label: 'Workspace Name *', helpKey: 'workspaceName', value: model.workspace.name }),
    buildField({ id: 'wdesc', label: 'Description *', helpKey: 'workspaceDescription', value: model.workspace.description, textarea: true }),
    buildField({ id: 'wauthor', label: 'Author (optional)', helpKey: 'workspaceAuthor', value: model.workspace.author }),
    buildField({ id: 'wtags', label: 'Tags / Properties (optional)', helpKey: 'workspaceTags', value: model.workspace.tags })
  ];
  fields.forEach(f => card.appendChild(f.wrap));
  content.appendChild(card);

  navButtons(content, index, async (next) => {
    model.workspace.name = fields[0].input.value.trim();
    model.workspace.description = fields[1].input.value.trim();
    model.workspace.author = fields[2].input.value.trim();
    model.workspace.tags = fields[3].input.value.trim();
    await persist();
    onNavigate(next);
  });
}

// ---------- Generic simple list step ----------
function renderSimpleListStep(content, { items, columns, addLabel, onAdd, onEdit, onDelete, tagRenderer }) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'list-header' }, [
    el('div', {}, ''),
    el('button', { class: 'btn btn-primary', onclick: onAdd }, addLabel)
  ]));
  if (items.length === 0) {
    card.appendChild(el('div', { class: 'empty-state' }, 'Nothing added yet.'));
  } else {
    items.forEach(item => {
      const main = el('div', { class: 'item-main' }, [
        el('div', { class: 'item-name' }, columns.name(item)),
        el('div', { class: 'item-desc' }, columns.desc(item)),
        tagRenderer ? tagRenderer(item) : null
      ]);
      card.appendChild(el('div', { class: 'item-row' }, [
        main,
        el('div', { class: 'item-actions' }, [
          el('button', { class: 'btn btn-icon', onclick: () => onEdit(item) }, 'Edit'),
          el('button', { class: 'btn btn-icon btn-danger', onclick: () => confirmDelete(`Delete "${columns.name(item)}"?`, () => onDelete(item)) }, 'Delete')
        ])
      ]));
    });
  }
  content.appendChild(card);
}

// ---------- Step 2: People ----------
function renderPeopleStep(content, model, index, onNavigate) {
  function reRender() { content.innerHTML = ''; renderStepBody(content, model, index, onNavigate); }
  const doAdd = () => openModal('Add Person', [
    { id: 'name', label: 'Name *', helpKey: 'personName' },
    { id: 'description', label: 'Description', helpKey: 'personDescription', textarea: true },
    { id: 'tags', label: 'Tags (optional)' }
  ], {}, async (v) => {
    if (!v.name) return toast('Name is required.', 'error');
    model.people.push({ id: newId('person'), ...v });
    await persist();
    reRender();
  });
  const doEdit = (item) => openModal('Edit Person', [
    { id: 'name', label: 'Name *', helpKey: 'personName' },
    { id: 'description', label: 'Description', helpKey: 'personDescription', textarea: true },
    { id: 'tags', label: 'Tags (optional)' }
  ], item, async (v) => {
    Object.assign(item, v);
    await persist();
    reRender();
  });
  const doDelete = (item) => {
    model.people = model.people.filter(p => p.id !== item.id);
    persist();
    reRender();
  };

  renderSimpleListStep(content, {
    items: model.people,
    columns: { name: p => p.name, desc: p => p.description },
    addLabel: '+ Add Person',
    onAdd: doAdd, onEdit: doEdit, onDelete: doDelete,
    tagRenderer: p => p.tags ? el('span', { class: 'tag' }, p.tags) : null
  });
  navButtons(content, index, onNavigate);
}

// ---------- Step 3: Software Systems ----------
function renderSystemsStep(content, model, index, onNavigate) {
  const fieldsFor = () => [
    { id: 'name', label: 'Name *', helpKey: 'systemName' },
    { id: 'description', label: 'Description', helpKey: 'systemDescription', textarea: true },
    { id: 'type', label: 'Type', helpKey: 'systemType', options: [{ value: 'Internal', label: 'Internal' }, { value: 'External', label: 'External' }] },
    { id: 'technology', label: 'Technology (optional)' },
    { id: 'tags', label: 'Tags (optional)' }
  ];
  const doAdd = () => openModal('Add Software System', fieldsFor(), { type: 'Internal' }, async (v) => {
    if (!v.name) return toast('Name is required.', 'error');
    model.softwareSystems.push({ id: newId('sys'), ...v });
    await persist();
    reRender();
  });
  const doEdit = (item) => openModal('Edit Software System', fieldsFor(), item, async (v) => {
    Object.assign(item, v);
    await persist();
    reRender();
  });
  const doDelete = (item) => {
    model.softwareSystems = model.softwareSystems.filter(s => s.id !== item.id);
    persist();
    reRender();
  };
  function reRender() { content.innerHTML = ''; renderStepBody(content, model, index, onNavigate); }

  renderSimpleListStep(content, {
    items: model.softwareSystems,
    columns: { name: s => s.name, desc: s => s.description },
    addLabel: '+ Add Software System',
    onAdd: doAdd, onEdit: doEdit, onDelete: doDelete,
    tagRenderer: s => el('span', { class: 'tag ' + (s.type === 'External' ? 'external' : 'internal') }, s.type)
  });
  navButtons(content, index, onNavigate);
}

// ---------- Generic relationship step (used for 3 different relationship kinds) ----------
function renderRelationshipStep(content, model, index, onNavigate, { collectionKey, getEndpoints, sourceHelp, targetHelp, techHelp = 'relationshipTechnology', emptyMsg }) {
  const endpoints = getEndpoints(model);
  const options = endpoints.map(e => ({ value: e.id, label: e.name }));

  function reRender() { content.innerHTML = ''; renderStepBody(content, model, index, onNavigate); }

  if (endpoints.length < 2) {
    content.appendChild(el('div', { class: 'card empty-state' }, emptyMsg));
    navButtons(content, index, onNavigate);
    return;
  }

  const fieldsFor = () => [
    { id: 'sourceId', label: 'From *', helpKey: sourceHelp, options },
    { id: 'targetId', label: 'To *', helpKey: targetHelp, options },
    { id: 'description', label: 'Description *', helpKey: 'relationshipDescription' },
    { id: 'technology', label: 'Technology / Protocol (optional)', helpKey: techHelp }
  ];
  const doAdd = () => openModal('Add Relationship', fieldsFor(), {}, async (v) => {
    if (!v.description) return toast('Description is required.', 'error');
    model[collectionKey].push({ id: newId('rel'), ...v });
    await persist();
    reRender();
  });
  const doEdit = (item) => openModal('Edit Relationship', fieldsFor(), item, async (v) => {
    Object.assign(item, v);
    await persist();
    reRender();
  });
  const doDelete = (item) => {
    model[collectionKey] = model[collectionKey].filter(r => r.id !== item.id);
    persist();
    reRender();
  };

  renderSimpleListStep(content, {
    items: model[collectionKey],
    columns: {
      name: r => `${findElementName(model, r.sourceId)} → ${findElementName(model, r.targetId)}`,
      desc: r => r.description
    },
    addLabel: '+ Add Relationship',
    onAdd: doAdd, onEdit: doEdit, onDelete: doDelete,
    tagRenderer: r => r.technology ? el('span', { class: 'tag' }, r.technology) : null
  });
  navButtons(content, index, onNavigate);
}

function renderRelationshipsStep(content, model, index, onNavigate) {
  renderRelationshipStep(content, model, index, onNavigate, {
    collectionKey: 'relationships',
    getEndpoints: allReferenceableElements,
    sourceHelp: 'relationshipFrom', targetHelp: 'relationshipTo',
    emptyMsg: 'Add at least two people/software systems first to define relationships.'
  });
}

function renderContainerRelationshipsStep(content, model, index, onNavigate) {
  renderRelationshipStep(content, model, index, onNavigate, {
    collectionKey: 'containerRelationships',
    getEndpoints: allContainerElements,
    sourceHelp: 'relationshipFrom', targetHelp: 'relationshipTo',
    emptyMsg: 'This step is optional. Add at least two containers in the previous step to define container relationships.'
  });
}

function renderComponentRelationshipsStep(content, model, index, onNavigate) {
  renderRelationshipStep(content, model, index, onNavigate, {
    collectionKey: 'componentRelationships',
    getEndpoints: allComponentElements,
    sourceHelp: 'relationshipFrom', targetHelp: 'relationshipTo',
    emptyMsg: 'This step is optional. Add at least two components in the previous step to define component relationships.'
  });
}

// ---------- Step 5: Containers ----------
function renderContainersStep(content, model, index, onNavigate) {
  function reRender() { content.innerHTML = ''; renderStepBody(content, model, index, onNavigate); }

  if (model.softwareSystems.length === 0) {
    content.appendChild(el('div', { class: 'card empty-state' }, 'This step is optional. Add a software system first if you want to decompose it into containers.'));
    navButtons(content, index, onNavigate);
    return;
  }

  const sysOptions = model.softwareSystems.map(s => ({ value: s.id, label: s.name }));
  const fieldsFor = () => [
    { id: 'systemId', label: 'Software System *', helpKey: 'containerParent', options: sysOptions },
    { id: 'name', label: 'Container Name *', helpKey: 'containerName' },
    { id: 'description', label: 'Description / Responsibility', helpKey: 'containerDescription', textarea: true },
    { id: 'technology', label: 'Technology', helpKey: 'containerTechnology' },
    { id: 'tags', label: 'Tags (optional)' }
  ];
  const doAdd = () => openModal('Add Container', fieldsFor(), {}, async (v) => {
    if (!v.name) return toast('Container name is required.', 'error');
    model.containers.push({ id: newId('cont'), ...v });
    await persist();
    reRender();
  });
  const doEdit = (item) => openModal('Edit Container', fieldsFor(), item, async (v) => {
    Object.assign(item, v);
    await persist();
    reRender();
  });
  const doDelete = (item) => {
    model.containers = model.containers.filter(c => c.id !== item.id);
    persist();
    reRender();
  };

  renderSimpleListStep(content, {
    items: model.containers,
    columns: { name: c => c.name, desc: c => c.description },
    addLabel: '+ Add Container',
    onAdd: doAdd, onEdit: doEdit, onDelete: doDelete,
    tagRenderer: c => c.technology ? el('span', { class: 'tag' }, c.technology) : null
  });
  navButtons(content, index, onNavigate);
}

// ---------- Step 7: Components ----------
function renderComponentsStep(content, model, index, onNavigate) {
  function reRender() { content.innerHTML = ''; renderStepBody(content, model, index, onNavigate); }

  if (model.containers.length === 0) {
    content.appendChild(el('div', { class: 'card empty-state' }, 'This step is optional. Add a container first if you want to decompose it into components.'));
    navButtons(content, index, onNavigate);
    return;
  }

  const containerOptions = model.containers.map(c => ({ value: c.id, label: c.name }));
  const fieldsFor = () => [
    { id: 'containerId', label: 'Container *', helpKey: 'componentParent', options: containerOptions },
    { id: 'name', label: 'Component Name *', helpKey: 'componentName' },
    { id: 'description', label: 'Responsibility', helpKey: 'componentDescription', textarea: true },
    { id: 'technology', label: 'Technology (optional)', helpKey: 'componentTechnology' },
    { id: 'tags', label: 'Tags (optional)' }
  ];
  const doAdd = () => openModal('Add Component', fieldsFor(), {}, async (v) => {
    if (!v.name) return toast('Component name is required.', 'error');
    model.components.push({ id: newId('comp'), ...v });
    await persist();
    reRender();
  });
  const doEdit = (item) => openModal('Edit Component', fieldsFor(), item, async (v) => {
    Object.assign(item, v);
    await persist();
    reRender();
  });
  const doDelete = (item) => {
    model.components = model.components.filter(c => c.id !== item.id);
    persist();
    reRender();
  };

  renderSimpleListStep(content, {
    items: model.components,
    columns: { name: c => c.name, desc: c => c.description },
    addLabel: '+ Add Component',
    onAdd: doAdd, onEdit: doEdit, onDelete: doDelete,
    tagRenderer: c => c.technology ? el('span', { class: 'tag' }, c.technology) : null
  });
  navButtons(content, index, onNavigate);
}

// ---------- Step 9: Scenarios ----------
function renderScenariosStep(content, model, index, onNavigate) {
  function reRender() { content.innerHTML = ''; renderStepBody(content, model, index, onNavigate); }
  const endpoints = allScenarioReferenceable(model);
  const options = endpoints.map(e => ({ value: e.id, label: e.name }));

  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'list-header' }, [
    el('div', {}, ''),
    el('button', {
      class: 'btn btn-primary',
      onclick: () => openModal('Add Scenario', [
        { id: 'name', label: 'Scenario Name *', helpKey: 'scenarioName' },
        { id: 'description', label: 'Description (optional)' }
      ], {}, async (v) => {
        if (!v.name) return toast('Scenario name is required.', 'error');
        model.scenarios.push({ id: newId('scenario'), name: v.name, description: v.description, steps: [] });
        await persist();
        reRender();
      })
    }, '+ Add Scenario')
  ]));

  if (model.scenarios.length === 0) {
    card.appendChild(el('div', { class: 'empty-state' }, 'This step is optional. Add a scenario to describe an important interaction sequence.'));
  }

  model.scenarios.forEach(sc => {
    const stepsList = el('div', {}, sc.steps.map((st, i) => el('div', { class: 'item-row' }, [
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-name' }, `${i + 1}. ${findElementName(model, st.sourceId)} → ${findElementName(model, st.targetId)}`),
        el('div', { class: 'item-desc' }, st.description)
      ]),
      el('div', { class: 'item-actions' }, [
        el('button', {
          class: 'btn btn-icon btn-danger',
          onclick: () => { sc.steps = sc.steps.filter(s2 => s2.id !== st.id); persist(); reRender(); }
        }, 'Remove')
      ])
    ])));

    card.appendChild(el('div', { style: 'border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px;' }, [
      el('div', { class: 'list-header' }, [
        el('div', { class: 'item-name' }, sc.name),
        el('div', { class: 'item-actions' }, [
          el('button', {
            class: 'btn btn-icon',
            onclick: () => {
              if (endpoints.length < 2) return toast('Add at least two elements (people, systems, containers or components) before adding steps.', 'error');
              openModal('Add Step', [
                { id: 'sourceId', label: 'From *', helpKey: 'scenarioStep', options },
                { id: 'targetId', label: 'To *', options },
                { id: 'description', label: 'Description *' }
              ], {}, async (v) => {
                if (!v.description) return toast('Description is required.', 'error');
                sc.steps.push({ id: newId('step'), ...v });
                await persist();
                reRender();
              });
            }
          }, '+ Add Step'),
          el('button', { class: 'btn btn-icon btn-danger', onclick: () => confirmDelete(`Delete scenario "${sc.name}"?`, () => { model.scenarios = model.scenarios.filter(s2 => s2.id !== sc.id); persist(); reRender(); }) }, 'Delete')
        ])
      ]),
      sc.steps.length ? stepsList : el('div', { class: 'empty-state' }, 'No steps yet.')
    ]));
  });

  content.appendChild(card);
  navButtons(content, index, onNavigate);
}

// ---------- Step 10: Deployment ----------
function renderDeploymentStep(content, model, index, onNavigate) {
  function reRender() { content.innerHTML = ''; renderStepBody(content, model, index, onNavigate); }

  const card = el('div', { class: 'card' });
  const toggle = el('label', { style: 'display:flex; align-items:center; gap:8px; font-weight:600;' }, [
    (() => { const cb = el('input', { type: 'checkbox' }); cb.checked = model.deployment.enabled; cb.addEventListener('change', async () => { model.deployment.enabled = cb.checked; await persist(); reRender(); }); return cb; })(),
    'Describe where the software is deployed'
  ]);
  card.appendChild(toggle);
  content.appendChild(card);

  if (!model.deployment.enabled) {
    content.appendChild(el('div', { class: 'card empty-state' }, 'This step is optional and currently disabled.'));
    navButtons(content, index, onNavigate);
    return;
  }

  const instanceOptions = [...allContainerElements(model), ...allReferenceableElements(model)].map(e => ({ value: e.id, label: e.name }));

  const envCard = el('div', { class: 'card' });
  envCard.appendChild(el('div', { class: 'list-header' }, [
    el('div', {}, ''),
    el('button', {
      class: 'btn btn-primary',
      onclick: () => openModal('Add Environment', [{ id: 'name', label: 'Environment Name *', helpKey: 'deploymentEnvironment' }], {}, async (v) => {
        if (!v.name) return toast('Environment name is required.', 'error');
        model.deployment.environments.push({ id: newId('env'), name: v.name, nodes: [] });
        await persist();
        reRender();
      })
    }, '+ Add Environment')
  ]));

  if (model.deployment.environments.length === 0) {
    envCard.appendChild(el('div', { class: 'empty-state' }, 'No environments yet.'));
  }

  model.deployment.environments.forEach(env => {
    const nodesList = el('div', {}, env.nodes.map(node => el('div', { class: 'item-row' }, [
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-name' }, node.name),
        el('div', { class: 'item-desc' }, (node.instances || []).map(i => findElementName(model, i.refId)).join(', ') || 'No instances placed')
      ]),
      el('div', { class: 'item-actions' }, [
        el('button', {
          class: 'btn btn-icon',
          onclick: () => openModal('Place Instance', [{ id: 'refId', label: 'Container / System *', helpKey: 'deploymentInstance', options: instanceOptions }], {}, async (v) => {
            node.instances = node.instances || [];
            node.instances.push({ id: newId('inst'), refId: v.refId });
            await persist();
            reRender();
          })
        }, '+ Instance'),
        el('button', { class: 'btn btn-icon btn-danger', onclick: () => confirmDelete(`Delete node "${node.name}"?`, () => { env.nodes = env.nodes.filter(n => n.id !== node.id); persist(); reRender(); }) }, 'Delete')
      ])
    ])));

    envCard.appendChild(el('div', { style: 'border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:12px;' }, [
      el('div', { class: 'list-header' }, [
        el('div', { class: 'item-name' }, env.name),
        el('div', { class: 'item-actions' }, [
          el('button', {
            class: 'btn btn-icon',
            onclick: () => openModal('Add Deployment Node', [
              { id: 'name', label: 'Node Name *', helpKey: 'deploymentNode' },
              { id: 'technology', label: 'Technology (optional)' }
            ], {}, async (v) => {
              if (!v.name) return toast('Node name is required.', 'error');
              env.nodes.push({ id: newId('node'), name: v.name, technology: v.technology, instances: [] });
              await persist();
              reRender();
            })
          }, '+ Add Node'),
          el('button', { class: 'btn btn-icon btn-danger', onclick: () => confirmDelete(`Delete environment "${env.name}"?`, () => { model.deployment.environments = model.deployment.environments.filter(e2 => e2.id !== env.id); persist(); reRender(); }) }, 'Delete')
        ])
      ]),
      env.nodes.length ? nodesList : el('div', { class: 'empty-state' }, 'No deployment nodes yet.')
    ]));
  });

  content.appendChild(envCard);
  navButtons(content, index, onNavigate);
}

// ---------- Step 11: Views ----------
function renderViewsStep(content, model, index, onNavigate) {
  const card = el('div', { class: 'card' });
  const viewDefs = [
    ['systemLandscape', 'System Landscape'],
    ['systemContext', 'System Context'],
    ['container', 'Container'],
    ['component', 'Component'],
    ['dynamic', 'Dynamic'],
    ['deployment', 'Deployment']
  ];
  viewDefs.forEach(([key, label]) => {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!model.views[key];
    cb.addEventListener('change', async () => { model.views[key] = cb.checked; await persist(); });
    card.appendChild(el('label', { style: 'display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--border);' }, [cb, label]));
  });
  content.appendChild(card);
  content.appendChild(el('div', { class: 'card empty-state' }, 'Select "System Context" to include a system-context view for your primary software system, and so on for each view type. Sensible defaults are pre-selected.'));
  navButtons(content, index, onNavigate);
}

// ---------- Step 12: Validate & Generate ----------
function renderValidateStep(content, model, index, onNavigate) {
  const result = validateModel(model);
  let filter = 'all';

  const card = el('div', { class: 'card' });
  card.appendChild(el('h3', { style: 'margin-top:0' }, 'Validation Results'));

  const filterBar = el('div', { class: 'validation-filters' });
  const listWrap = el('div', {});

  function renderList() {
    listWrap.innerHTML = '';
    const all = [
      ...result.errors.map(x => ({ ...x, kind: 'error', symbol: '✗' })),
      ...result.warnings.map(x => ({ ...x, kind: 'warning', symbol: '⚠' })),
      ...result.info.map(x => ({ ...x, kind: 'info', symbol: '✓' }))
    ];
    const shown = filter === 'all' ? all : all.filter(x => x.kind === filter);
    if (shown.length === 0) listWrap.appendChild(el('div', { class: 'empty-state' }, 'Nothing to show.'));
    shown.forEach(x => listWrap.appendChild(el('div', { class: `validation-item ${x.kind}` }, [el('span', {}, x.symbol), el('span', {}, x.msg)])));
  }

  [['all', `All (${result.errors.length + result.warnings.length + result.info.length})`],
   ['error', `Errors (${result.errors.length})`],
   ['warning', `Warnings (${result.warnings.length})`],
   ['info', `Info (${result.info.length})`]].forEach(([key, label]) => {
    const btn = el('button', { class: 'btn' + (key === filter ? ' active' : '') }, label);
    btn.addEventListener('click', () => {
      filter = key;
      filterBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderList();
    });
    filterBar.appendChild(btn);
  });

  card.appendChild(filterBar);
  card.appendChild(listWrap);
  renderList();
  content.appendChild(card);

  const dslCard = el('div', { class: 'card' });
  dslCard.appendChild(el('h3', { style: 'margin-top:0' }, 'Generated Structurizr DSL'));

  if (!result.isValid) {
    dslCard.appendChild(el('div', { class: 'validation-item error' }, [el('span', {}, '✗'), el('span', {}, 'Resolve all errors above before the DSL can be generated and downloaded.')]));
  } else {
    const dsl = generateDsl(model);
    const pre = el('pre', { class: 'dsl-output' }, dsl);
    const toolbar = el('div', { class: 'dsl-toolbar' }, [
      el('div', { class: 'dsl-toolbar-label' }, 'Generated from your stored architecture model.'),
      el('div', { class: 'dsl-actions' }, [
        el('button', {
          class: 'btn',
          onclick: async () => { await navigator.clipboard.writeText(dsl); toast('DSL copied to clipboard.', 'success'); }
        }, 'Copy DSL'),
        el('button', {
          class: 'btn btn-primary',
          onclick: () => {
            const blob = new Blob([dsl], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(model.workspace.name || 'workspace').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.dsl`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }, 'Download .dsl')
      ])
    ]);
    dslCard.appendChild(toolbar);
    dslCard.appendChild(pre);
  }
  content.appendChild(dslCard);

  navButtons(content, index, onNavigate, { nextLabel: 'Done', onNext: () => onNavigate(-2) });
}
