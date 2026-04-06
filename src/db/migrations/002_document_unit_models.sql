CREATE TABLE IF NOT EXISTS document_unit_models (
  document_id TEXT PRIMARY KEY,
  model_version INTEGER NOT NULL,
  source_format TEXT NOT NULL,
  model_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_unit_models_version ON document_unit_models (model_version);
