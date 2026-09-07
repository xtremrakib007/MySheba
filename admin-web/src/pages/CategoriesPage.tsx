import { useEffect, useState } from 'react';
import {
  addCategory,
  fetchCategories,
  MODULE_LABELS,
  removeCategory,
} from '../services/categoryService';

const MODULES = Object.keys(MODULE_LABELS);

function ModuleCard({ module }: { module: string }) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchCategories(module));
    } catch (err) {
      console.error(err);
      setError('Could not load categories.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setItems(await addCategory(module, newName));
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add category.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(name: string) {
    setBusy(true);
    setError(null);
    try {
      setItems(await removeCategory(module, name));
    } catch (err) {
      console.error(err);
      setError('Could not remove category.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <h2 className="text-lg font-bold">{MODULE_LABELS[module]}</h2>

      {error && (
        <div className="mt-3 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : (
        <div className="mt-4 divide-y divide-[var(--color-line)]">
          {items.map((name) => (
            <div key={name} className="flex items-center justify-between py-2.5">
              <span>{name}</span>
              <button
                disabled={busy}
                onClick={() => handleRemove(name)}
                className="rounded-full bg-[var(--color-danger)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New category name"
          className="flex-1 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <button
          disabled={busy || !newName.trim()}
          onClick={handleAdd}
          className="rounded-lg border border-dashed border-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] disabled:opacity-40"
        >
          + Add Category
        </button>
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Categories</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Listing categories per marketplace module. New listings pick from these lists; removing a
        category doesn't change the text already saved on existing listings.
      </p>

      <div className="mt-6 space-y-6">
        {MODULES.map((module) => (
          <ModuleCard key={module} module={module} />
        ))}
      </div>
    </div>
  );
}
