import { useEffect, useState } from 'react';
import {
  createConfigRecord,
  deleteConfigRecord,
  fetchConfigRecords,
  updateConfigRecord,
  type ConfigField,
  type ConfigRecord,
} from '../services/configService';

function emptyValues(fields: ConfigField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) values[f.key] = f.type === 'boolean' ? true : '';
  return values;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <select
        value={value ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value === 'true')}
        className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
      >
        <option value="true">Active</option>
        <option value="false">Inactive</option>
      </select>
    );
  }
  if (field.type === 'select') {
    return (
      <select
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
      >
        <option value="" disabled>
          Select…
        </option>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      value={(value as string | number) ?? ''}
      placeholder={field.placeholder}
      onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
      className="w-full rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5 text-sm"
    />
  );
}

export default function ConfigListPage({
  collectionName,
  title,
  description,
  fields,
}: {
  collectionName: string;
  title: string;
  description: string;
  fields: ConfigField[];
}) {
  const [records, setRecords] = useState<ConfigRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [adding, setAdding] = useState(false);
  const [newValues, setNewValues] = useState<Record<string, unknown>>(emptyValues(fields));
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRecords(await fetchConfigRecords(collectionName));
    } catch (err) {
      console.error(err);
      setError(`Could not load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName]);

  function startEdit(record: ConfigRecord) {
    setEditingId(record.id);
    const values: Record<string, unknown> = {};
    for (const f of fields) values[f.key] = record[f.key];
    setEditValues(values);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    try {
      await updateConfigRecord(collectionName, id, editValues);
      setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...editValues } : r)));
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setError('Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await deleteConfigRecord(collectionName, id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error(err);
      setError('Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    try {
      await createConfigRecord(collectionName, newValues);
      setNewValues(emptyValues(fields));
      setAdding(false);
      await load();
    } catch (err) {
      console.error(err);
      setError('Could not create the new entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{description}</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white"
          >
            Add new
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              {fields.map((f) => (
                <th key={f.key} className="px-4 py-3 font-semibold">
                  {f.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="border-b border-[var(--color-line)] bg-black/[0.02]">
                {fields.map((f) => (
                  <td key={f.key} className="px-4 py-2">
                    <FieldInput
                      field={f}
                      value={newValues[f.key]}
                      onChange={(v) => setNewValues((prev) => ({ ...prev, [f.key]: v }))}
                    />
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-3">
                    <button
                      disabled={busy}
                      onClick={handleCreate}
                      className="text-xs font-semibold text-[var(--color-primary-dark)] hover:underline"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setAdding(false)}
                      className="text-xs font-semibold text-[var(--color-ink-soft)] hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {records.map((record) => {
              const isEditing = editingId === record.id;
              return (
                <tr key={record.id} className="border-b border-[var(--color-line)] last:border-0">
                  {fields.map((f) => (
                    <td key={f.key} className="px-4 py-3">
                      {isEditing ? (
                        <FieldInput
                          field={f}
                          value={editValues[f.key]}
                          onChange={(v) => setEditValues((prev) => ({ ...prev, [f.key]: v }))}
                        />
                      ) : f.type === 'boolean' ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            record[f.key]
                              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                              : 'bg-black/5 text-[var(--color-ink-soft)]'
                          }`}
                        >
                          {record[f.key] ? 'Active' : 'Inactive'}
                        </span>
                      ) : (
                        String(record[f.key] ?? '—')
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-3">
                      {isEditing ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => saveEdit(record.id)}
                            className="text-xs font-semibold text-[var(--color-primary-dark)] hover:underline"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs font-semibold text-[var(--color-ink-soft)] hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(record)}
                            className="text-xs font-semibold text-[var(--color-primary-dark)] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => handleDelete(record.id)}
                            className="text-xs font-semibold text-[var(--color-danger)] hover:underline"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && records.length === 0 && !adding && (
              <tr>
                <td
                  colSpan={fields.length + 1}
                  className="px-4 py-10 text-center text-sm text-[var(--color-ink-soft)]"
                >
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <p className="mt-3 text-xs text-[var(--color-ink-soft)]">Loading…</p>}
    </div>
  );
}
