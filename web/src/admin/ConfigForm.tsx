import { useState } from 'react';
import { defaultGameConfig, type GameConfig } from '@kuckuckskind/shared';
import { CONFIG_SCHEMA, ENUM_LABEL, getIn, setIn, type SchemaNode } from './configForm.ts';

interface Props {
  value: GameConfig;
  onChange: (next: GameConfig) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
}

/**
 * Alle Spielwerte als Formular, erzeugt aus dem Zod-Schema (Beschriftung, Einheit, Grenzen,
 * Schrittweite aus `meta`). Geänderte Werte sind markiert und lassen sich zurücksetzen.
 */
export function ConfigForm({ value, onChange, errors, readOnly }: Props) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  return (
    <div className="config-form">
      <input
        className="config-filter"
        placeholder="Wert suchen (z. B. Fuchs, Tempo, Schwelle)"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {Object.entries(CONFIG_SCHEMA.properties ?? {}).map(([key, node]) => (
        <Group
          key={key}
          node={node}
          path={[key]}
          value={value}
          onChange={onChange}
          errors={errors}
          filter={q}
          readOnly={readOnly}
          depth={0}
        />
      ))}
    </div>
  );
}

function matches(node: SchemaNode, key: string, filter: string): boolean {
  if (!filter) return true;
  if ((node.label ?? key).toLowerCase().includes(filter) || key.toLowerCase().includes(filter))
    return true;
  return Object.entries(node.properties ?? {}).some(([k, n]) => matches(n, k, filter));
}

function Group(props: {
  node: SchemaNode;
  path: string[];
  value: GameConfig;
  onChange: (v: GameConfig) => void;
  errors: Record<string, string>;
  filter: string;
  readOnly?: boolean;
  depth: number;
}) {
  const { node, path, filter, depth } = props;
  const key = path[path.length - 1] as string;
  if (!matches(node, key, filter)) return null;
  if (node.type !== 'object' || !node.properties) return <Field {...props} />;

  const changed =
    JSON.stringify(getIn(props.value, path)) !== JSON.stringify(getIn(defaultGameConfig, path));
  // Passt der Gruppenname zur Suche, alle Werte der Gruppe zeigen.
  const ownMatch = !!filter && (node.label ?? key).toLowerCase().includes(filter);
  return (
    <details className={`config-group depth-${depth}`} open={filter ? true : undefined}>
      <summary>
        {node.label ?? key}
        {changed && <span className="changed-dot" title="weicht vom Standard ab" />}
      </summary>
      <div className="config-fields">
        {Object.entries(node.properties).map(([k, child]) => (
          <Group
            key={k}
            {...props}
            node={child}
            path={[...path, k]}
            depth={depth + 1}
            filter={ownMatch ? '' : filter}
          />
        ))}
      </div>
    </details>
  );
}

function Field({
  node,
  path,
  value,
  onChange,
  errors,
  readOnly,
}: {
  node: SchemaNode;
  path: string[];
  value: GameConfig;
  onChange: (v: GameConfig) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
}) {
  const id = path.join('.');
  const current = getIn(value, path);
  const def = getIn(defaultGameConfig, path);
  const changed = JSON.stringify(current) !== JSON.stringify(def);
  const set = (v: unknown) => onChange(setIn(value, path, v));
  const label = node.label ?? path[path.length - 1];
  const numberNode = node.anyOf?.find((n) => n.type === 'number' || n.type === 'integer') ?? node;
  const nullable = !!node.anyOf?.some((n) => n.type === 'null');
  const error = errors[id];

  let input: React.ReactNode;
  if (node.type === 'boolean') {
    input = (
      <input
        type="checkbox"
        checked={!!current}
        disabled={readOnly || node.const !== undefined}
        onChange={(e) => set(e.target.checked)}
      />
    );
  } else if (node.type === 'string' && node.enum) {
    input = (
      <select value={String(current)} disabled={readOnly} onChange={(e) => set(e.target.value)}>
        {node.enum.map((v) => (
          <option key={v} value={v}>
            {ENUM_LABEL[v] ?? v}
          </option>
        ))}
      </select>
    );
  } else if (node.type === 'array' && node.items?.enum) {
    const list = (current as string[]) ?? [];
    input = (
      <span className="config-chips">
        {node.items.enum.map((v) => (
          <label key={v} className="check">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={list.includes(v)}
              onChange={(e) => set(e.target.checked ? [...list, v] : list.filter((x) => x !== v))}
            />
            {ENUM_LABEL[v] ?? v}
          </label>
        ))}
      </span>
    );
  } else if (numberNode.type === 'number' || numberNode.type === 'integer') {
    const isInt = numberNode.type === 'integer';
    const step = node.step ?? (isInt ? 1 : 0.01);
    const isNull = current === null;
    input = (
      <span className="config-number">
        {nullable && (
          <label className="check">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={isNull}
              onChange={(e) => set(e.target.checked ? null : (numberNode.minimum ?? 1))}
            />
            automatisch
          </label>
        )}
        {!isNull && (
          <>
            {numberNode.minimum !== undefined && numberNode.maximum !== undefined && (
              <input
                type="range"
                min={numberNode.minimum}
                max={numberNode.maximum}
                step={step}
                value={Number(current)}
                disabled={readOnly}
                onChange={(e) => set(Number(e.target.value))}
              />
            )}
            <input
              type="number"
              min={numberNode.minimum}
              max={numberNode.maximum}
              step={step}
              value={Number.isFinite(Number(current)) ? Number(current) : ''}
              disabled={readOnly}
              onChange={(e) => set(e.target.value === '' ? def : Number(e.target.value))}
            />
            {node.unit && <span className="unit">{node.unit}</span>}
          </>
        )}
      </span>
    );
  } else {
    input = <code>{JSON.stringify(current)}</code>;
  }

  return (
    <div className={`config-field ${changed ? 'changed' : ''} ${error ? 'invalid' : ''}`}>
      <div className="config-label">
        <span title={id}>{label}</span>
        {node.description && <span className="hint">{node.description}</span>}
      </div>
      <div className="config-input">
        {input}
        {changed && !readOnly && (
          <button
            className="link reset"
            title={`Standard: ${JSON.stringify(def)}`}
            onClick={() => set(def)}
          >
            ↺
          </button>
        )}
      </div>
      {error && <div className="problem">{error}</div>}
    </div>
  );
}
