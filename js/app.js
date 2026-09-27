// app.js — entry point. Wires together db.js, model.js and ui.js.
// Routing is intentionally minimal (no framework): we just swap what's rendered into #app-root.

import { listProjects, saveModel, loadModel, deleteProject } from './db.js';
import { createEmptyModel, ensureStyles } from './model.js';
import { renderDashboard, newProjectModal, importDslModal, renderWizard, renderSettings, toast } from './ui.js';
import { parseDsl } from './dsl-importer.js';

async function showDashboard() {
  const projects = await listProjects();
  renderDashboard(projects, {
    open: async (id) => {
      const model = ensureStyles(await loadModel(id));
      showWizard(model, 0);
    },
    remove: async (id) => {
      await deleteProject(id);
      showDashboard();
    },
    create: () => {
      newProjectModal(async (values) => {
        const model = createEmptyModel(values.name);
        model.workspace.description = values.description || '';
        model.workspace.author = values.author || '';
        model.workspace.tags = values.tags || '';
        await saveModel(model);
        showWizard(model, 0);
      });
    },
    importDsl: () => {
      importDslModal(async (text) => {
        const { model, warnings } = parseDsl(text);
        ensureStyles(model);
        await saveModel(model);
        showWizard(model, 0);
        // Toasts render into document.body directly, so they survive the screen switch above.
        warnings.slice(0, 4).forEach(w => toast(w, 'error'));
        if (warnings.length > 4) toast(`...and ${warnings.length - 4} more item(s) skipped during import.`, 'error');
        if (warnings.length === 0) toast('DSL imported successfully.', 'success');
      });
    }
  });
}

function showWizard(model, stepIndex) {
  renderWizard(model, stepIndex, (target) => {
    if (target === -2) {
      showDashboard();
    } else if (target === -3) {
      renderSettings(model, () => showWizard(model, stepIndex));
    } else {
      showWizard(model, target);
    }
  });
}

showDashboard();
