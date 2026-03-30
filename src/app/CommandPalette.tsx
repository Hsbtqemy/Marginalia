import { useEffect, useMemo, useRef, useState } from "react";

export interface CommandPaletteItem {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: CommandPaletteItem[];
  onClose: () => void;
}

function matchesCommand(command: CommandPaletteItem, query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const haystack = [
    command.title,
    command.section,
    command.shortcut ?? "",
    ...(command.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return props.commands.filter((command) => matchesCommand(command, normalizedQuery));
  }, [props.commands, query]);

  useEffect(() => {
    if (!props.open) {
      setQuery("");
      setHighlightedIndex(0);
      return;
    }

    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [props.open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  if (!props.open) {
    return null;
  }

  const executeCommand = (command: CommandPaletteItem | undefined) => {
    if (!command || command.disabled) {
      return;
    }
    props.onClose();
    command.onSelect();
  };

  return (
    <div
      className="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div className="command-palette">
        <div className="modal-header">
          <strong id="command-palette-title">Quick Actions</strong>
          <button type="button" className="ghost-button" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="command-palette-body">
          <input
            ref={inputRef}
            className="app-input command-palette-input"
            value={query}
            placeholder="Search actions, views, or shortcuts..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                props.onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.min(index + 1, Math.max(filteredCommands.length - 1, 0)));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.max(index - 1, 0));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                executeCommand(filteredCommands[highlightedIndex]);
              }
            }}
          />
          <div className="command-palette-results" role="listbox" aria-label="Quick actions">
            {filteredCommands.length === 0 ? (
              <div className="command-palette-empty">No action matches this search.</div>
            ) : (
              filteredCommands.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className="command-palette-item"
                  data-highlighted={index === highlightedIndex ? "true" : "false"}
                  data-disabled={command.disabled ? "true" : "false"}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => executeCommand(command)}
                  disabled={command.disabled}
                >
                  <span className="command-palette-copy">
                    <span className="command-palette-title">{command.title}</span>
                    <span className="command-palette-section">{command.section}</span>
                  </span>
                  {command.shortcut ? <span className="command-palette-shortcut">{command.shortcut}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
