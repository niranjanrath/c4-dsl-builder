// app.js — entry point. Wires together db.js, model.js and ui.js.
// Routing is intentionally minimal (no framework): we just swap what's rendered into #app-root.

import { listProjects, saveModel, loadModel, deleteProject } from './db.js';
import { createEmptyModel } from './model.js';
import { renderDashboard, newProjectModal, renderWizard } from './ui.js';

async function showDashboard() {
  const projects = await listProjects();
  renderDashboard(projects, {
    open: async (id) => {
      const model = await loadModel(id);
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
    }
  });
}

function showWizard(model, stepIndex) {
  renderWizard(model, stepIndex, (target) => {
    if (target === -2) {
      showDashboard();
    } else {
      showWizard(model, target);
    }
  });
}

showDashboard();
