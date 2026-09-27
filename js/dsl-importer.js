// dsl-importer.js — parses Structurizr DSL text back into our architecture model.
// This is the reverse of dsl-generator.js. It's tuned to round-trip DSL exported by this
// tool (predictable structure, our own tag conventions for colors), and does a reasonable
// best-effort job on hand-written DSL, but Structurizr's full grammar is much larger than
// what we emit ourselves — anything it can't confidently map is skipped with a warning
// rather than guessed at, so a partial import never corrupts the rest of the model.

import { createEmptyModel, newId } from './model.js';

function stripComments(text) {
  let out = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

function extractQuoted(str) {
  const result = [];
  const re = /"([^"]*)"/g;
  let m;
  while ((m = re.exec(str || '')) !== null) result.push(m[1]);
  return result;
}

// Removes our own generated bookkeeping tags (External marker, per-element Style_ tags)
// from a tags string, leaving whatever custom tags the user actually typed.
function cleanTags(tagsStr) {
  if (!tagsStr) return '';
  return tagsStr.split(',').map(t => t.trim()).filter(t => t && t !== 'External' && !t.startsWith('Style_')).join(', ');
}

function hasExternalTag(tagsStr) {
  return !!(tagsStr || '').split(',').map(t => t.trim()).includes('External');
}

function setElementColor(model, kind, id, color) {
  const coll = kind === 'person' ? model.people
    : kind === 'softwareSystem' ? model.softwareSystems
    : kind === 'container' ? model.containers
    : kind === 'component' ? model.components
    : null;
  if (!coll) return;
  const obj = coll.find(x => x.id === id);
  if (obj) obj.color = color;
}

export function parseDsl(text) {
  const model = createEmptyModel('Imported Project');
  const identMap = new Map(); // DSL identifier (e.g. "orderApi") -> { id, kind }
  const warnings = [];

  const lines = stripComments(text).split('\n').map(l => l.trim()).filter(Boolean);
  const stack = []; // { type, id? }
  let currentSoftwareSystemId = null;
  let currentContainerId = null;
  let currentEnvId = null;
  let currentNodeId = null;
  let currentStyleTag = null;

  const top = () => stack[stack.length - 1];

  for (const raw of lines) {
    if (raw === '}') {
      const popped = stack.pop();
      if (popped) {
        if (popped.type === 'softwareSystem') currentSoftwareSystemId = null;
        if (popped.type === 'container') currentContainerId = null;
        if (popped.type === 'deploymentEnvironment') currentEnvId = null;
        if (popped.type === 'deploymentNode') currentNodeId = null;
        if (popped.type === 'elementStyle') currentStyleTag = null;
      }
      continue;
    }

    const opensBlock = raw.endsWith('{');
    const line = opensBlock ? raw.slice(0, -1).trim() : raw;
    const topType = top() ? top().type : null;
    let m;

    // workspace "Name" "Description" {
    if (!topType && (m = /^workspace\s+"([^"]*)"(?:\s+"([^"]*)")?/.exec(line))) {
      model.workspace.name = m[1] || model.workspace.name;
      model.workspace.description = m[2] || '';
      if (opensBlock) stack.push({ type: 'workspace' });
      continue;
    }
    if (line === 'model') { if (opensBlock) stack.push({ type: 'model' }); continue; }
    if (line === 'views') { if (opensBlock) stack.push({ type: 'views' }); continue; }
    if (topType !== 'elementStyle' && line === 'styles') { if (opensBlock) stack.push({ type: 'styles' }); continue; }

    // identifier = person|softwareSystem|container|component|deploymentEnvironment ...
    if ((m = /^(\w+)\s*=\s*(person|softwareSystem|container|component|deploymentEnvironment)\s+(.*)$/.exec(line))) {
      const [, ident, kind, rest] = m;
      const quoted = extractQuoted(rest);

      if (kind === 'person') {
        const p = { id: newId('person'), name: quoted[0] || ident, description: quoted[1] || '', tags: cleanTags(quoted[2]), color: '' };
        model.people.push(p);
        identMap.set(ident, { id: p.id, kind: 'person' });

      } else if (kind === 'softwareSystem') {
        const tagsRaw = quoted[2] || '';
        const s = {
          id: newId('sys'), name: quoted[0] || ident, description: quoted[1] || '',
          type: hasExternalTag(tagsRaw) ? 'External' : 'Internal', technology: '', tags: cleanTags(tagsRaw), color: ''
        };
        model.softwareSystems.push(s);
        identMap.set(ident, { id: s.id, kind: 'softwareSystem' });
        currentSoftwareSystemId = s.id;
        if (opensBlock) stack.push({ type: 'softwareSystem', id: s.id });

      } else if (kind === 'container') {
        if (!currentSoftwareSystemId) { warnings.push(`Container "${ident}" was outside a software system block and was skipped.`); continue; }
        // Technology and tags are both optional and both come after description, so with only
        // one extra quoted value present we assume it's technology (the more commonly used field).
        const c = {
          id: newId('cont'), systemId: currentSoftwareSystemId, name: quoted[0] || ident, description: quoted[1] || '',
          technology: quoted.length >= 3 ? quoted[2] : '', tags: quoted.length >= 4 ? cleanTags(quoted[3]) : '', color: ''
        };
        model.containers.push(c);
        identMap.set(ident, { id: c.id, kind: 'container' });
        currentContainerId = c.id;
        if (opensBlock) stack.push({ type: 'container', id: c.id });

      } else if (kind === 'component') {
        if (!currentContainerId) { warnings.push(`Component "${ident}" was outside a container block and was skipped.`); continue; }
        const cm = {
          id: newId('comp'), containerId: currentContainerId, name: quoted[0] || ident, description: quoted[1] || '',
          technology: quoted.length >= 3 ? quoted[2] : '', tags: quoted.length >= 4 ? cleanTags(quoted[3]) : '', color: ''
        };
        model.components.push(cm);
        identMap.set(ident, { id: cm.id, kind: 'component' });

      } else if (kind === 'deploymentEnvironment') {
        const env = { id: newId('env'), name: quoted[0] || ident, nodes: [] };
        model.deployment.environments.push(env);
        model.deployment.enabled = true;
        identMap.set(ident, { id: env.id, kind: 'deploymentEnvironment' });
        currentEnvId = env.id;
        if (opensBlock) stack.push({ type: 'deploymentEnvironment', id: env.id });
      }
      continue;
    }

    // deploymentNode "Name" "Technology" { — nested deployment nodes are flattened
    // one level (into the same environment) rather than modelled as infrastructure trees.
    if ((topType === 'deploymentEnvironment' || topType === 'deploymentNode') && (m = /^deploymentNode\s+(.*)$/.exec(line))) {
      const quoted = extractQuoted(m[1]);
      const env = model.deployment.environments.find(e => e.id === currentEnvId);
      if (env) {
        const node = { id: newId('node'), name: quoted[0] || 'Node', technology: quoted[1] || '', instances: [] };
        env.nodes.push(node);
        currentNodeId = node.id;
        if (opensBlock) stack.push({ type: 'deploymentNode', id: node.id });
        if (topType === 'deploymentNode') warnings.push(`Nested deployment node "${node.name}" was flattened into its parent environment.`);
      }
      continue;
    }

    // containerInstance <identifier> / softwareSystemInstance <identifier>
    if ((m = /^(?:containerInstance|softwareSystemInstance)\s+(\w+)/.exec(line))) {
      const target = identMap.get(m[1]);
      const env = model.deployment.environments.find(e => e.id === currentEnvId);
      const node = env && env.nodes.find(n => n.id === currentNodeId);
      if (target && node) node.instances.push({ id: newId('inst'), refId: target.id });
      else warnings.push(`Deployment instance "${m[1]}" could not be placed (unknown element or missing node).`);
      continue;
    }

    // tags "..." on its own line inside a multi-line software system block
    if (topType === 'softwareSystem' && (m = /^tags\s+"([^"]*)"/.exec(line))) {
      const sys = model.softwareSystems.find(s => s.id === currentSoftwareSystemId);
      if (sys) {
        if (hasExternalTag(m[1])) sys.type = 'External';
        sys.tags = cleanTags(m[1]);
      }
      continue;
    }

    // relationships: identifierA -> identifierB "Description" "Technology"
    if ((m = /^(\w+)\s*->\s*(\w+)\s*(.*)$/.exec(line))) {
      const [, srcIdent, tgtIdent, rest] = m;
      const quoted = extractQuoted(rest);
      const src = identMap.get(srcIdent);
      const tgt = identMap.get(tgtIdent);
      if (src && tgt) {
        const rel = { id: newId('rel'), sourceId: src.id, targetId: tgt.id, description: quoted[0] || '', technology: quoted[1] || '' };
        if (src.kind === 'container' && tgt.kind === 'container') model.containerRelationships.push(rel);
        else if (src.kind === 'component' && tgt.kind === 'component') model.componentRelationships.push(rel);
        else model.relationships.push(rel);
      } else {
        warnings.push(`Relationship "${srcIdent} -> ${tgtIdent}" references an unrecognized element and was skipped.`);
      }
      continue;
    }

    // views block: which view types were configured
    if (topType === 'views') {
      if (/^systemLandscape\b/.test(line)) model.views.systemLandscape = true;
      else if (/^systemContext\b/.test(line)) model.views.systemContext = true;
      else if (/^container\b/.test(line)) model.views.container = true;
      else if (/^component\b/.test(line)) model.views.component = true;
      else if (/^dynamic\b/.test(line)) model.views.dynamic = true;
      else if (/^deployment\b/.test(line)) model.views.deployment = true;
      if (opensBlock) {
        if (line === 'styles') stack.push({ type: 'styles' });
        else stack.push({ type: 'viewBlock' });
      }
      continue;
    }

    // styles block: element "Tag" { background #hex ... }
    if (topType === 'styles' && (m = /^element\s+"([^"]*)"/.exec(line))) {
      currentStyleTag = m[1];
      if (opensBlock) stack.push({ type: 'elementStyle', tag: currentStyleTag });
      continue;
    }
    if (topType === 'elementStyle' && (m = /^background\s+(#[0-9a-fA-F]{3,8})/.exec(line))) {
      const color = m[1];
      switch (currentStyleTag) {
        case 'Person': model.styles.defaults.person = color; break;
        case 'Software System': model.styles.defaults.internalSystem = color; break;
        case 'External': model.styles.defaults.externalSystem = color; break;
        case 'Container': model.styles.defaults.container = color; break;
        case 'Component': model.styles.defaults.component = color; break;
        default:
          if (currentStyleTag && currentStyleTag.startsWith('Style_')) {
            const target = identMap.get(currentStyleTag.slice('Style_'.length));
            if (target) setElementColor(model, target.kind, target.id, color);
          }
      }
      continue;
    }

    // Anything else (include *, autoLayout, theme, key/description-only lines, etc.)
    // is intentionally ignored — it doesn't map onto anything the wizard captures.
  }

  if (model.people.length === 0 && model.softwareSystems.length === 0) {
    warnings.push('No people or software systems could be recognized in this file — check that it\'s valid Structurizr DSL.');
  }

  return { model, warnings };
}
