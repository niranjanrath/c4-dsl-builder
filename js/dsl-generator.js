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

export function generateDsl(model) {
  usedIdentifiers.clear();
  const idMap = new Map(); // model element id -> dsl identifier

  const out = [];
  out.push(`workspace "${esc(model.workspace.name)}" "${esc(model.workspace.description)}" {`);
  out.push('');
  out.push('    model {');

  // People
  if (model.people.length) out.push('        // People');
  model.people.forEach(p => {
    const ident = identifierFor(p.name, 'person');
    idMap.set(p.id, ident);
    const tags = p.tags && p.tags.trim() ? ` "${esc(p.tags)}"` : '';
    out.push(`        ${ident} = person "${esc(p.name)}" "${esc(p.description)}"${tags}`);
  });
  if (model.people.length) out.push('');

  // Software systems (with nested containers/components)
  if (model.softwareSystems.length) out.push('        // Software Systems');
  model.softwareSystems.forEach(s => {
    const sysIdent = identifierFor(s.name, 'system');
    idMap.set(s.id, sysIdent);
    const sysContainers = model.containers.filter(c => c.systemId === s.id);

    if (sysContainers.length === 0) {
      const tagParts = [];
      if (s.type === 'External') tagParts.push('External');
      if (s.tags && s.tags.trim()) tagParts.push(s.tags.trim());
      const tags = tagParts.length ? ` "${esc(tagParts.join(','))}"` : '';
      out.push(`        ${sysIdent} = softwareSystem "${esc(s.name)}" "${esc(s.description)}"${tags}`);
    } else {
      out.push(`        ${sysIdent} = softwareSystem "${esc(s.name)}" "${esc(s.description)}" {`);
      sysContainers.forEach(c => {
        const cIdent = identifierFor(c.name, 'container');
        idMap.set(c.id, cIdent);
        const sysComponents = model.components.filter(cm => cm.containerId === c.id);
        const techPart = c.technology && c.technology.trim() ? ` "${esc(c.technology)}"` : '';
        if (sysComponents.length === 0) {
          out.push(`            ${cIdent} = container "${esc(c.name)}" "${esc(c.description)}"${techPart}`);
        } else {
          out.push(`            ${cIdent} = container "${esc(c.name)}" "${esc(c.description)}"${techPart} {`);
          sysComponents.forEach(cm => {
            const cmIdent = identifierFor(cm.name, 'component');
            idMap.set(cm.id, cmIdent);
            const cmTech = cm.technology && cm.technology.trim() ? ` "${esc(cm.technology)}"` : '';
            out.push(`                ${cmIdent} = component "${esc(cm.name)}" "${esc(cm.description)}"${cmTech}`);
          });
          out.push('            }');
        }
      });
      if (s.type === 'External' || (s.tags && s.tags.trim())) {
        const tagParts = [];
        if (s.type === 'External') tagParts.push('External');
        if (s.tags && s.tags.trim()) tagParts.push(s.tags.trim());
        out.push(`            tags "${esc(tagParts.join(','))}"`);
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
  if (model.deployment.enabled && model.deployment.environments.length) {
    out.push('        // Deployment');
    model.deployment.environments.forEach(env => {
      out.push(`        deploymentEnvironment "${esc(env.name)}" {`);
      env.nodes.forEach(node => {
        const techPart = node.technology && node.technology.trim() ? ` "${esc(node.technology)}"` : '';
        out.push(`            deploymentNode "${esc(node.name)}"${techPart} {`);
        (node.instances || []).forEach(inst => {
          const ident = idMap.get(inst.refId);
          if (ident) out.push(`                containerInstance ${ident}`);
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
      const scopeIdent = idMap.get(systemForView && systemForView.id) || '*';
      out.push(`        dynamic ${scopeIdent} "Dynamic_${identifierFor(sc.name, 'scenario')}" "${esc(sc.description || sc.name)}" {`);
      sc.steps.forEach(step => {
        const src = idMap.get(step.sourceId);
        const tgt = idMap.get(step.targetId);
        if (!src || !tgt) return;
        out.push(`            ${src} -> ${tgt} "${esc(step.description)}"`);
      });
      out.push('            autoLayout');
      out.push('        }');
    });
  }
  if (model.views.deployment && model.deployment.enabled && systemForView) {
    const sysIdent = idMap.get(systemForView.id);
    model.deployment.environments.forEach(env => {
      out.push(`        deployment ${sysIdent} "${esc(env.name)}" "Deployment_${identifierFor(env.name, 'env')}" {`);
      out.push('            include *');
      out.push('            autoLayout');
      out.push('        }');
    });
  }
  out.push('        theme default');
  out.push('    }'); // end views
  out.push('}'); // end workspace

  return out.join('\n');
}
