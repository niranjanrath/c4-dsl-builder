// validation.js — checks the architecture model for completeness and consistency.
// Errors block DSL download. Warnings and info do not.

export function validateModel(model) {
  const errors = [];
  const warnings = [];
  const info = [];

  // Workspace
  if (model.workspace.name && model.workspace.name.trim()) {
    info.push({ msg: 'Workspace name is defined' });
  } else {
    errors.push({ msg: 'Workspace name is required' });
  }
  if (!model.workspace.description || !model.workspace.description.trim()) {
    warnings.push({ msg: 'Workspace has no description' });
  }

  // People
  if (model.people.length > 0) {
    info.push({ msg: 'At least one person is defined' });
  } else {
    warnings.push({ msg: 'No people defined — the model has no external actors' });
  }
  model.people.forEach(p => {
    if (!p.description || !p.description.trim()) warnings.push({ msg: `Person "${p.name}" has no description` });
  });

  // Software systems
  if (model.softwareSystems.length > 0) {
    info.push({ msg: 'At least one software system is defined' });
  } else {
    errors.push({ msg: 'At least one software system is required' });
  }
  model.softwareSystems.forEach(s => {
    if (!s.description || !s.description.trim()) warnings.push({ msg: `Software system "${s.name}" has no description` });
  });

  // Relationships reference valid elements
  const elementIds = new Set([
    ...model.people.map(p => p.id),
    ...model.softwareSystems.map(s => s.id)
  ]);
  let relRefsValid = true;
  model.relationships.forEach(r => {
    if (!elementIds.has(r.sourceId) || !elementIds.has(r.targetId)) {
      relRefsValid = false;
      errors.push({ msg: `Relationship "${r.description || '(no description)'}" references an element that no longer exists` });
    }
  });
  if (model.relationships.length > 0 && relRefsValid) {
    info.push({ msg: 'People/software system relationship references are valid' });
  }

  // Systems with no incoming or outgoing relationship at all (info/warning, not blocking)
  model.softwareSystems.forEach(s => {
    const hasRel = model.relationships.some(r => r.sourceId === s.id || r.targetId === s.id);
    if (!hasRel) warnings.push({ msg: `Software system "${s.name}" has no incoming or outgoing relationship` });
  });

  // Containers: parent references valid
  const systemIds = new Set(model.softwareSystems.map(s => s.id));
  let containerRefsValid = true;
  model.containers.forEach(c => {
    if (!systemIds.has(c.systemId)) {
      containerRefsValid = false;
      errors.push({ msg: `Container "${c.name}" has no valid parent software system` });
    }
    if (!c.technology || !c.technology.trim()) warnings.push({ msg: `Container "${c.name}" has no technology specified` });
  });
  if (model.containers.length > 0 && containerRefsValid) {
    info.push({ msg: 'Container parent references are valid' });
  }

  // Container relationships reference valid containers
  const containerIds = new Set(model.containers.map(c => c.id));
  model.containerRelationships.forEach(r => {
    if (!containerIds.has(r.sourceId) || !containerIds.has(r.targetId)) {
      errors.push({ msg: `Container relationship "${r.description || '(no description)'}" references a container that no longer exists` });
    }
  });

  // Components: parent references valid
  let componentRefsValid = true;
  model.components.forEach(c => {
    if (!containerIds.has(c.containerId)) {
      componentRefsValid = false;
      errors.push({ msg: `Component "${c.name}" has no valid parent container` });
    }
  });
  if (model.components.length > 0 && componentRefsValid) {
    info.push({ msg: 'Component parent references are valid' });
  }

  // Component relationships reference valid components
  const componentIds = new Set(model.components.map(c => c.id));
  model.componentRelationships.forEach(r => {
    if (!componentIds.has(r.sourceId) || !componentIds.has(r.targetId)) {
      errors.push({ msg: `Component relationship "${r.description || '(no description)'}" references a component that no longer exists` });
    }
  });

  // Scenarios
  if (model.scenarios.length === 0) {
    info.push({ msg: 'No dynamic scenario defined (optional)' });
  }

  // Deployment
  if (!model.deployment.enabled || model.deployment.environments.length === 0) {
    info.push({ msg: 'Deployment information not provided (optional)' });
  }

  // Views
  const anyView = Object.values(model.views).some(Boolean);
  if (!anyView) {
    warnings.push({ msg: 'No views selected — default views will be used' });
  } else {
    info.push({ msg: 'Views configuration will use your selections' });
  }

  return {
    errors,
    warnings,
    info,
    isValid: errors.length === 0
  };
}
