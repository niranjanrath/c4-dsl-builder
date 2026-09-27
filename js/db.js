// db.js — local-first persistence via Dexie (IndexedDB wrapper).
// Every project's full architecture model is stored as a single JSON blob keyed by project id,
// plus a lightweight row for dashboard listing. All data stays in the browser; there is no backend.

const db = new Dexie('C4DslBuilderDB');

db.version(1).stores({
  // Lightweight index used by the dashboard (avoid loading full models to list them)
  projects: 'id, name, updatedAt',
  // Full model blobs, one row per project
  models: 'id'
});

export async function listProjects() {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function saveModel(model) {
  model.meta.updatedAt = new Date().toISOString();
  await db.models.put({ id: model.meta.id, model });
  await db.projects.put({
    id: model.meta.id,
    name: model.workspace.name || model.meta.name,
    description: model.workspace.description || '',
    updatedAt: model.meta.updatedAt
  });
  return model;
}

export async function loadModel(id) {
  const row = await db.models.get(id);
  return row ? row.model : null;
}

export async function deleteProject(id) {
  await db.models.delete(id);
  await db.projects.delete(id);
}

export default db;
