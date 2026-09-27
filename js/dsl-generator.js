// dsl-generator.js — turns the architecture model into Structurizr DSL text.
// This is the ONLY module that knows about DSL syntax. It never reads form fields directly,
// only the validated model object. Do not invent syntax beyond what is implemented here —
// cross-check against the official Structurizr DSL language reference before extending it.

function esc(str) {
  return String(str || '').replace(/"/g, '\\"');
}

// Turns "Order Management Platform" into a safe camelCase identifier: orderManagementPlatform
const usedIdentifiers = new Set();
function identifierFor(name, fallbackPrefix = 'el') {
  let base = String(name || fallbackPrefix)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('') || fallbackPrefix;
  let candidate = base;
  let n = 2;
  while (usedIdentifiers.has(candidate)) {
    candidate = `${base}${n}`;
    n++;
  }
  usedIdentifiers.add(candidate);
  return candidate;
}

function indent(lines, level) {
  const pad = '    '.repeat(level);
  return lines.map(l => (l === '' ? '' : pad + l));
}

// Combines an element's free-text tags with an optional generated style tag into the
// `"Tag1,Tag2"` argument Structurizr expects, or '' if there's nothing to attach.
function tagsArg(customTags, styleTag) {
  const parts = [];
  if (customTags && customTags.trim()) parts.push(customTags.trim());
  if (styleTag) parts.push(styleTag);
  return parts.length ? ` "${esc(parts.join(','))}"` : '';
}

function kindOf(model, id) {
  if (model.people.some(p => p.id === id)) return 'person';
  if (model.softwareSystems.some(s => s.id === id)) return 'softwareSystem';
  if (model.containers.some(c => c.id === id)) return 'container';
  if (model.components.some(c => c.id === id)) return 'component';
  return null;
}

// Structurizr restricts what can appear in a dynamic view based on its scope element:
//   *  (workspace)      -> people and software systems only
//   software system     -> people, other software systems, and containers OF THAT SYSTEM
//   container           -> people, other software systems, other containers, and components OF THAT CONTAINER
// A scenario built from the wizard isn't necessarily consistent with any single one of these
// (e.g. it might mix containers from two different software systems), so we pick the most
// specific scope the scenario's steps actually support, then drop any step that still doesn't
// fit that scope, rather than emitting DSL Structurizr would reject outright.
function resolveDynamicScope(model, idMap, scenario) {
  const componentStep = scenario.steps.find(st => kindOf(model, st.sourceId) === 'component' || kindOf(model, st.targetId) === 'component');
  const containerStep = scenario.steps.find(st => kindOf(model, st.sourceId) === 'container' || kindOf(model, st.targetId) === 'container');

  let scopeIdent = '*';
  let isValid = (id) => ['person', 'softwareSystem'].includes(kindOf(model, id));

  if (componentStep) {
    const compId = kindOf(model, componentStep.sourceId) === 'component' ? componentStep.sourceId : componentStep.targetId;
    const containerId = (model.components.find(c => c.id === compId) || {}).containerId;
    if (containerId && idMap.get(containerId)) {
      scopeIdent = idMap.get(containerId);
      isValid = (id) => {
        const k = kindOf(model, id);
        if (k === 'person' || k === 'softwareSystem' || k === 'container') return true;
        if (k === 'component') return (model.components.find(c => c.id === id) || {}).containerId === containerId;
        return false;
      };
    }
  } else if (containerStep) {
    const contId = kindOf(model, containerStep.sourceId) === 'container' ? containerStep.sourceId : containerStep.targetId;
    const systemId = (model.containers.find(c => c.id === contId) || {}).systemId;
    if (systemId && idMap.get(systemId)) {
      scopeIdent = idMap.get(systemId);
      isValid = (id) => {
        const k = kindOf(model, id);
        if (k === 'person' || k === 'softwareSystem') return true;
        if (k === 'container') return (model.containers.find(c => c.id === id) || {}).systemId === systemId;
        return false;
      };
    }
  }

  const validSteps = scenario.steps.filter(st => idMap.get(st.sourceId) && idMap.get(st.targetId) && isValid(st.sourceId) && isValid(st.targetId));
  return { scopeIdent, validSteps };
}

export function generateDsl(model) {
  usedIdentifiers.clear();
  const idMap = new Map(); // model element id -> dsl identifier
  const elementStyles = []; // { tag, color } — one per element with an explicit color override

  const out = [];
  out.push(`workspace "${esc(model.workspace.name)}" "${esc(model.workspace.description)}" {`);
  out.push('');
  out.push('    model {');

  // People
  if (model.people.length) out.push('        // People');
  model.people.forEach(p => {
    const ident = identifierFor(p.name, 'person');
    idMap.set(p.id, ident);
    let styleTag = null;
    if (p.color) { styleTag = `Style_${ident}`; elementStyles.push({ tag: styleTag, color: p.color }); }
    const tags = tagsArg(p.tags, styleTag);
    out.push(`        ${ident} = person "${esc(p.name)}" "${esc(p.description)}"${tags}`);
  });
  if (model.people.length) out.push('');

  // Software systems (with nested containers/components)
  if (model.softwareSystems.length) out.push('        // Software Systems');
  model.softwareSystems.forEach(s => {
    const sysIdent = identifierFor(s.name, 'system');
    idMap.set(s.id, sysIdent);
    const sysContainers = model.containers.filter(c => c.systemId === s.id);

    let sysStyleTag = null;
    if (s.color) { sysStyleTag = `Style_${sysIdent}`; elementStyles.push({ tag: sysStyleTag, color: s.color }); }
    const sysTagParts = [];
    if (s.type === 'External') sysTagParts.push('External');
    if (s.tags && s.tags.trim()) sysTagParts.push(s.tags.trim());
    if (sysStyleTag) sysTagParts.push(sysStyleTag);
    const sysTags = sysTagParts.length ? ` "${esc(sysTagParts.join(','))}"` : '';

    if (sysContainers.length === 0) {
      out.push(`        ${sysIdent} = softwareSystem "${esc(s.name)}" "${esc(s.description)}"${sysTags}`);
    } else {
      out.push(`        ${sysIdent} = softwareSystem "${esc(s.name)}" "${esc(s.description)}" {`);
      sysContainers.forEach(c => {
        const cIdent = identifierFor(c.name, 'container');
        idMap.set(c.id, cIdent);
        const sysComponents = model.components.filter(cm => cm.containerId === c.id);
        const techPart = c.technology && c.technology.trim() ? ` "${esc(c.technology)}"` : '';
        let cStyleTag = null;
        if (c.color) { cStyleTag = `Style_${cIdent}`; elementStyles.push({ tag: cStyleTag, color: c.color }); }
        const cTags = tagsArg(c.tags, cStyleTag);
        if (sysComponents.length === 0) {
          out.push(`            ${cIdent} = container "${esc(c.name)}" "${esc(c.description)}"${techPart}${cTags}`);
        } else {
          out.push(`            ${cIdent} = container "${esc(c.name)}" "${esc(c.description)}"${techPart}${cTags} {`);
          sysComponents.forEach(cm => {
            const cmIdent = identifierFor(cm.name, 'component');
            idMap.set(cm.id, cmIdent);
            const cmTech = cm.technology && cm.technology.trim() ? ` "${esc(cm.technology)}"` : '';
            let cmStyleTag = null;
            if (cm.color) { cmStyleTag = `Style_${cmIdent}`; elementStyles.push({ tag: cmStyleTag, color: cm.color }); }
            const cmTags = tagsArg(cm.tags, cmStyleTag);
            out.push(`                ${cmIdent} = component "${esc(cm.name)}" "${esc(cm.description)}"${cmTech}${cmTags}`);
          });
          out.push('            }');
        }
      });
      if (sysTagParts.length) {
        out.push(`            tags "${esc(sysTagParts.join(','))}"`);
      }
      out.push('        }');
    }
  });
  if (model.softwareSystems.length) out.push('');

  // Component relationships (nested reference, written flat here for simplicity/readability)
  if (model.componentRelationships.length) {
    out.push('        // Component Relationships');
    model.componentRelationships.forEach(r => {
      const src = idMap.get(r.sourceId);
      const tgt = idMap.get(r.targetId);
      if (!src || !tgt) return;
      const tech = r.technology && r.technology.trim() ? ` "${esc(r.technology)}"` : '';
      out.push(`        ${src} -> ${tgt} "${esc(r.description)}"${tech}`);
    });
    out.push('');
  }

  // Container relationships
  if (model.containerRelationships.length) {
    out.push('        // Container Relationships');
    model.containerRelationships.forEach(r => {
      const src = idMap.get(r.sourceId);
      const tgt = idMap.get(r.targetId);
      if (!src || !tgt) return;
      const tech = r.technology && r.technology.trim() ? ` "${esc(r.technology)}"` : '';
      out.push(`        ${src} -> ${tgt} "${esc(r.description)}"${tech}`);
    });
    out.push('');
  }

  // Person / software system relationships
  if (model.relationships.length) {
    out.push('        // Relationships');
    model.relationships.forEach(r => {
      const src = idMap.get(r.sourceId);
      const tgt = idMap.get(r.targetId);
      if (!src || !tgt) return;
      const tech = r.technology && r.technology.trim() ? ` "${esc(r.technology)}"` : '';
      out.push(`        ${src} -> ${tgt} "${esc(r.description)}"${tech}`);
    });
    out.push('');
  }

  // Deployment
  const envIdMap = new Map(); // environment.id -> dsl identifier
  if (model.deployment.enabled && model.deployment.environments.length) {
    out.push('        // Deployment');
    model.deployment.environments.forEach(env => {
      const envIdent = identifierFor(env.name, 'env');
      envIdMap.set(env.id, envIdent);
      out.push(`        ${envIdent} = deploymentEnvironment "${esc(env.name)}" {`);
      env.nodes.forEach(node => {
        const techPart = node.technology && node.technology.trim() ? ` "${esc(node.technology)}"` : '';
        out.push(`            deploymentNode "${esc(node.name)}"${techPart} {`);
        (node.instances || []).forEach(inst => {
          const ident = idMap.get(inst.refId);
          if (!ident) return;
          const kind = kindOf(model, inst.refId);
          if (kind === 'container') out.push(`                containerInstance ${ident}`);
          else if (kind === 'softwareSystem') out.push(`                softwareSystemInstance ${ident}`);
          // people/components aren't valid deployment instances in Structurizr — skip rather than emit invalid DSL
        });
        out.push('            }');
      });
      out.push('        }');
    });
    out.push('');
  }

  out.push('    }'); // end model
  out.push('');

  // Views
  out.push('    views {');
  const systemForView = model.softwareSystems[0]; // primary system for context/container/component views
  if (model.views.systemLandscape) {
    out.push('        systemLandscape "SystemLandscape" {');
    out.push('            include *');
    out.push('            autoLayout');
    out.push('        }');
  }
  if (model.views.systemContext && systemForView) {
    const ident = idMap.get(systemForView.id);
    out.push(`        systemContext ${ident} "SystemContext" {`);
    out.push('            include *');
    out.push('            autoLayout');
    out.push('        }');
  }
  if (model.views.container && systemForView) {
    const ident = idMap.get(systemForView.id);
    out.push(`        container ${ident} "Containers" {`);
    out.push('            include *');
    out.push('            autoLayout');
    out.push('        }');
  }
  if (model.views.component && model.containers.length) {
    model.containers.forEach(c => {
      const hasComponents = model.components.some(cm => cm.containerId === c.id);
      if (!hasComponents) return;
      const ident = idMap.get(c.id);
      out.push(`        component ${ident} "Components_${ident}" {`);
      out.push('            include *');
      out.push('            autoLayout');
      out.push('        }');
    });
  }
  if (model.views.dynamic && model.scenarios.length) {
    model.scenarios.forEach(sc => {
      const scoped = resolveDynamicScope(model, idMap, sc);
      if (scoped.validSteps.length === 0) return; // nothing left that Structurizr would accept for this scenario
      out.push(`        dynamic ${scoped.scopeIdent} "Dynamic_${identifierFor(sc.name, 'scenario')}" "${esc(sc.description || sc.name)}" {`);
      scoped.validSteps.forEach(step => {
        const src = idMap.get(step.sourceId);
        const tgt = idMap.get(step.targetId);
        out.push(`            ${src} -> ${tgt} "${esc(step.description)}"`);
      });
      out.push('            autoLayout');
      out.push('        }');
    });
  }
  if (model.views.deployment && model.deployment.enabled) {
    model.deployment.environments.forEach(env => {
      const envIdent = envIdMap.get(env.id);
      if (!envIdent) return;
      out.push(`        deployment * ${envIdent} "Deployment_${envIdent}" {`);
      out.push('            include *');
      out.push('            autoLayout');
      out.push('        }');
    });
  }
  out.push('        theme default');
  out.push('');
  out.push('        styles {');
  const d = (model.styles && model.styles.defaults) || {};
  if (d.person) out.push(`            element "Person" {\n                background ${d.person}\n                color #ffffff\n            }`);
  if (d.internalSystem) out.push(`            element "Software System" {\n                background ${d.internalSystem}\n                color #ffffff\n            }`);
  if (d.externalSystem) out.push(`            element "External" {\n                background ${d.externalSystem}\n                color #ffffff\n            }`);
  if (d.container) out.push(`            element "Container" {\n                background ${d.container}\n                color #ffffff\n            }`);
  if (d.component) out.push(`            element "Component" {\n                background ${d.component}\n                color #000000\n            }`);
  // Per-element overrides are emitted last, so they win over the type-level defaults above
  // for any element that was individually colored in Settings.
  elementStyles.forEach(({ tag, color }) => {
    out.push(`            element "${tag}" {\n                background ${color}\n            }`);
  });
  out.push('        }');
  out.push('    }'); // end views
  out.push('}'); // end workspace

  return out.join('\n');
}
