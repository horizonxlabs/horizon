// Mock data layer — the app's data source until the user syncs a real database.
// Stores collections in memory, persisted to localStorage in the browser so data
// survives reloads and the mock phase feels like a real app. When the user asks to
// connect the real database, the typed seeds below become the schema blueprint.

export type WithId = { id: string };

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createStore<T extends WithId>(key: string, seed: T[]) {
  const storageKey = `mock:${key}`;
  const canPersist = typeof window !== "undefined" && Boolean(window.localStorage);

  function read(): T[] {
    if (canPersist) {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw) as T[];
      } catch {
        // fall through to seed
      }
    }
    return [...seed];
  }

  function write(rows: T[]): T[] {
    if (canPersist) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(rows));
      } catch {
        // storage full/unavailable — keep working in memory
      }
    }
    return rows;
  }

  return {
    list(): T[] {
      return read();
    },
    get(id: string): T | undefined {
      return read().find((row) => row.id === id);
    },
    add(row: Omit<T, "id"> & Partial<WithId>): T {
      const created = { ...row, id: row.id ?? uid() } as T;
      write([created, ...read()]);
      return created;
    },
    update(id: string, patch: Partial<T>): T | undefined {
      const rows = read();
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return undefined;
      rows[index] = { ...rows[index], ...patch, id };
      write(rows);
      return rows[index];
    },
    remove(id: string): void {
      write(read().filter((row) => row.id !== id));
    },
    reset(): T[] {
      return write([...seed]);
    }
  };
}
