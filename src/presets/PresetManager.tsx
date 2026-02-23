import { useEffect, useMemo, useState } from "react";
import {
  duplicatePreset,
  normalizePreset,
  type ExportPreset,
  type ExportPresetRecord,
} from "./presetSchema";
import { newUuid } from "../utils/uuid";

interface PresetManagerProps {
  open: boolean;
  presets: ExportPresetRecord[];
  defaultPresetId: string | null;
  onClose: () => void;
  onSavePreset: (preset: ExportPresetRecord) => void;
  onDeletePreset: (presetId: string) => void;
  onSetDefaultPreset: (presetId: string) => void;
}

function stringifyFallbacks(value: string[]): string {
  return value.join(", ");
}

function parseFallbacks(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function nextDraft(base: ExportPresetRecord, patch: Partial<ExportPreset>): ExportPresetRecord {
  const normalized = normalizePreset({ ...base, ...patch });
  return {
    ...base,
    ...normalized,
  };
}

export function PresetManager(props: PresetManagerProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExportPresetRecord | null>(null);

  const orderedPresets = useMemo(
    () => [...props.presets].sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name)),
    [props.presets],
  );

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const fallbackId = props.defaultPresetId ?? orderedPresets[0]?.id ?? null;
    const selected = orderedPresets.find((preset) => preset.id === selectedPresetId) ?? orderedPresets.find((preset) => preset.id === fallbackId);

    if (selected) {
      setSelectedPresetId(selected.id);
      setDraft({ ...selected });
    } else {
      setSelectedPresetId(null);
      setDraft(null);
    }
  }, [orderedPresets, props.defaultPresetId, props.open, selectedPresetId]);

  if (!props.open) {
    return null;
  }

  const selectedPreset = orderedPresets.find((preset) => preset.id === selectedPresetId) ?? null;

  const saveDraft = () => {
    if (!draft) {
      return;
    }

    const normalized = normalizePreset(draft);
    if (draft.builtIn) {
      const customPreset: ExportPresetRecord = {
        ...draft,
        ...normalized,
        id: newUuid(),
        builtIn: false,
        name: `${draft.name} (Custom)`,
        updatedAt: Date.now(),
      };
      props.onSavePreset(customPreset);
      setSelectedPresetId(customPreset.id);
      setDraft(customPreset);
      return;
    }

    const updated: ExportPresetRecord = {
      ...draft,
      ...normalized,
      updatedAt: Date.now(),
    };
    props.onSavePreset(updated);
    setDraft(updated);
  };

  const duplicateSelected = () => {
    if (!selectedPreset) {
      return;
    }
    const copy = duplicatePreset(selectedPreset);
    props.onSavePreset(copy);
    setSelectedPresetId(copy.id);
    setDraft(copy);
  };

  const deleteSelected = () => {
    if (!selectedPreset || selectedPreset.builtIn) {
      return;
    }
    props.onDeletePreset(selectedPreset.id);
  };

  return (
    <div className="preset-manager-overlay" role="dialog" aria-modal="true" aria-label="Export presets">
      <div className="preset-manager">
        <div className="modal-header">
          <strong>Export Presets</strong>
          <label className="app-chip" htmlFor="default-preset-select">
            Default:
            <select
              id="default-preset-select"
              className="app-select"
              value={props.defaultPresetId ?? ""}
              onChange={(event) => props.onSetDefaultPreset(event.target.value)}
            >
              {orderedPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ghost-button" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <div className="preset-grid">
            <div>
              <div className="preset-actions">
                <button type="button" className="secondary-button" onClick={duplicateSelected}>
                  Duplicate
                </button>
                <button type="button" className="ghost-button" onClick={deleteSelected} disabled={!selectedPreset || selectedPreset.builtIn}>
                  Delete
                </button>
              </div>
              <div className="preset-list">
                {orderedPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="preset-item"
                    data-selected={preset.id === selectedPresetId}
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      setDraft({ ...preset });
                    }}
                  >
                    {preset.name}
                    {preset.builtIn ? " (Built-in)" : ""}
                  </button>
                ))}
              </div>
            </div>

            {!draft ? (
              <div className="empty-state">Select a preset to edit.</div>
            ) : (
              <form
                className="preset-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveDraft();
                }}
              >
                <label>
                  Name
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>

                <label>
                  Font Family
                  <input
                    value={draft.fontFamily}
                    onChange={(event) => setDraft(nextDraft(draft, { fontFamily: event.target.value }))}
                  />
                </label>

                <label>
                  Fallbacks (comma-separated)
                  <input
                    value={stringifyFallbacks(draft.fontFallbacks)}
                    onChange={(event) => setDraft(nextDraft(draft, { fontFallbacks: parseFallbacks(event.target.value) }))}
                  />
                </label>

                <label>
                  Font Size (pt)
                  <input
                    type="number"
                    min={8}
                    max={24}
                    step={0.5}
                    value={draft.fontSizePt}
                    onChange={(event) => setDraft(nextDraft(draft, { fontSizePt: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Line Height
                  <input
                    type="number"
                    min={1}
                    max={3}
                    step={0.05}
                    value={draft.lineHeight}
                    onChange={(event) => setDraft(nextDraft(draft, { lineHeight: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Paragraph Before (pt)
                  <input
                    type="number"
                    min={0}
                    max={40}
                    step={0.5}
                    value={draft.paragraphSpacingBeforePt}
                    onChange={(event) => setDraft(nextDraft(draft, { paragraphSpacingBeforePt: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Paragraph After (pt)
                  <input
                    type="number"
                    min={0}
                    max={40}
                    step={0.5}
                    value={draft.paragraphSpacingAfterPt}
                    onChange={(event) => setDraft(nextDraft(draft, { paragraphSpacingAfterPt: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Page Size
                  <select
                    value={draft.pageSize}
                    onChange={(event) => setDraft(nextDraft(draft, { pageSize: event.target.value as ExportPreset["pageSize"] }))}
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </select>
                </label>

                <label>
                  Margin Top (mm)
                  <input
                    type="number"
                    min={10}
                    max={50}
                    step={0.5}
                    value={draft.marginTopMm}
                    onChange={(event) => setDraft(nextDraft(draft, { marginTopMm: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Margin Right (mm)
                  <input
                    type="number"
                    min={10}
                    max={50}
                    step={0.5}
                    value={draft.marginRightMm}
                    onChange={(event) => setDraft(nextDraft(draft, { marginRightMm: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Margin Bottom (mm)
                  <input
                    type="number"
                    min={10}
                    max={50}
                    step={0.5}
                    value={draft.marginBottomMm}
                    onChange={(event) => setDraft(nextDraft(draft, { marginBottomMm: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Margin Left (mm)
                  <input
                    type="number"
                    min={10}
                    max={50}
                    step={0.5}
                    value={draft.marginLeftMm}
                    onChange={(event) => setDraft(nextDraft(draft, { marginLeftMm: Number(event.target.value) }))}
                  />
                </label>

                <label>
                  Heading H1 Scale
                  <input
                    type="number"
                    min={1}
                    max={3}
                    step={0.05}
                    value={draft.headingScale.h1}
                    onChange={(event) =>
                      setDraft(nextDraft(draft, { headingScale: { ...draft.headingScale, h1: Number(event.target.value) } }))
                    }
                  />
                </label>

                <label>
                  Heading H2 Scale
                  <input
                    type="number"
                    min={1}
                    max={3}
                    step={0.05}
                    value={draft.headingScale.h2}
                    onChange={(event) =>
                      setDraft(nextDraft(draft, { headingScale: { ...draft.headingScale, h2: Number(event.target.value) } }))
                    }
                  />
                </label>

                <label>
                  Heading H3 Scale
                  <input
                    type="number"
                    min={1}
                    max={3}
                    step={0.05}
                    value={draft.headingScale.h3}
                    onChange={(event) =>
                      setDraft(nextDraft(draft, { headingScale: { ...draft.headingScale, h3: Number(event.target.value) } }))
                    }
                  />
                </label>
              </form>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={duplicateSelected}>
            Duplicate
          </button>
          <button type="button" className="primary-button" onClick={saveDraft}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
