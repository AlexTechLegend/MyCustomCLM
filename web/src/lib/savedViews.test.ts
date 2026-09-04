import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_VIEWS, deleteView, loadSavedViews, normalizeQuery, saveView, viewsEqual } from './savedViews';

beforeEach(() => {
  localStorage.clear();
});

describe('normalizeQuery', () => {
  it('sorts params so key order does not affect equality', () => {
    expect(normalizeQuery('tag=web&status=critical')).toBe(normalizeQuery('status=critical&tag=web'));
  });

  it('strips a leading "?"', () => {
    expect(normalizeQuery('?status=critical')).toBe(normalizeQuery('status=critical'));
  });

  it('drops pagination params — they should not distinguish two otherwise-identical views', () => {
    expect(normalizeQuery('status=critical&page=3&pageSize=50')).toBe(normalizeQuery('status=critical'));
  });

  it('drops a param whose value is the sentinel "all"', () => {
    expect(normalizeQuery('status=all&tag=web')).toBe(normalizeQuery('tag=web'));
  });

  it('drops empty-value params', () => {
    expect(normalizeQuery('status=critical&q=')).toBe(normalizeQuery('status=critical'));
  });
});

describe('viewsEqual', () => {
  it('is true for two queries that normalize the same', () => {
    expect(viewsEqual('status=critical&page=2', 'page=9&status=critical')).toBe(true);
  });

  it('is false for genuinely different filters', () => {
    expect(viewsEqual('status=critical', 'status=expiring')).toBe(false);
  });
});

describe('saveView / loadSavedViews / deleteView', () => {
  it('starts with exactly the two built-in views and nothing else', () => {
    const views = loadSavedViews();
    expect(views).toHaveLength(BUILTIN_VIEWS.length);
    expect(views.every((v) => v.builtin)).toBe(true);
  });

  it('adds a saved view after the built-ins and persists it across a reload', () => {
    const saved = saveView('Prod web', 'tag=web&status=expiring');
    expect(saved.name).toBe('Prod web');
    expect(saved.query).toBe(normalizeQuery('tag=web&status=expiring'));

    const reloaded = loadSavedViews();
    expect(reloaded).toHaveLength(BUILTIN_VIEWS.length + 1);
    expect(reloaded.at(-1)).toMatchObject({ name: 'Prod web' });
  });

  it('deletes a user view by id', () => {
    const saved = saveView('Temp', 'status=expired');
    expect(loadSavedViews()).toHaveLength(BUILTIN_VIEWS.length + 1);
    deleteView(saved.id);
    expect(loadSavedViews()).toHaveLength(BUILTIN_VIEWS.length);
  });

  it('refuses to delete a built-in view', () => {
    deleteView(BUILTIN_VIEWS[0].id);
    expect(loadSavedViews()).toHaveLength(BUILTIN_VIEWS.length);
  });

  it('does not duplicate a built-in id even if it somehow ends up in storage', () => {
    localStorage.setItem('vigil:saved-views', JSON.stringify([{ ...BUILTIN_VIEWS[0], name: 'Renamed' }]));
    const views = loadSavedViews();
    expect(views.filter((v) => v.id === BUILTIN_VIEWS[0].id)).toHaveLength(1);
    // The built-in definition wins, not whatever was stored under the same id.
    expect(views.find((v) => v.id === BUILTIN_VIEWS[0].id)?.name).toBe(BUILTIN_VIEWS[0].name);
  });

  it('survives corrupted JSON in storage rather than throwing', () => {
    localStorage.setItem('vigil:saved-views', '{not json');
    expect(() => loadSavedViews()).not.toThrow();
    expect(loadSavedViews()).toHaveLength(BUILTIN_VIEWS.length);
  });
});
