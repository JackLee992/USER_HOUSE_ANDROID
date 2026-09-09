import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalogPreferences, toggleFavorite, orderGameIds, reorderVisibleIds} from '../standalone/catalog-preferences.js';

const ids = ['snake', 'tetris', 'gomoku', 'paopao', 'reversi'];

test('catalog preferences filter invalid IDs and duplicates while appending newly available games', () => {
  const original = {favorites:['paopao','missing','paopao',null,'snake'],order:['gomoku','missing','snake','snake']};
  assert.deepEqual(normalizeCatalogPreferences(original, ids), {
    favorites:['paopao','snake'],order:['gomoku','snake','tetris','paopao','reversi'],
  });
  assert.equal(original.order.length, 4, 'caller data remains unchanged');
  for (const value of [null, [], 'broken', {favorites:4,order:{}}])
    assert.deepEqual(normalizeCatalogPreferences(value, ids), {favorites:[],order:ids});
  assert.deepEqual(normalizeCatalogPreferences({}, ['snake','snake',null,'tetris']), {favorites:[],order:['snake','tetris']});
});

test('favorites toggle independently of the global game order', () => {
  const start = {favorites:['tetris'],order:[...ids].reverse()};
  const added = toggleFavorite(start, 'paopao', ids);
  assert.deepEqual(added.favorites,['tetris','paopao']);
  assert.deepEqual(toggleFavorite(added, 'tetris', ids).favorites,['paopao']);
  assert.deepEqual(added.order,start.order);
  assert.deepEqual(toggleFavorite(start, 'unknown', ids),start);
  assert.deepEqual(start.favorites,['tetris']);
  assert.deepEqual(orderGameIds(start,ids),start.order);
});

test('reordering a visible subset preserves every hidden game slot', () => {
  const start = {favorites:['paopao','snake'],order:ids};
  const next = reorderVisibleIds(start, ['snake','tetris','paopao'], ['paopao','snake','tetris'], ids);
  assert.deepEqual(next.order,['paopao','snake','gomoku','tetris','reversi']);
  assert.deepEqual(next.favorites,start.favorites);
  assert.deepEqual(start.order,ids);
  const favoritesOnly = reorderVisibleIds(start, ['snake','paopao'], ['paopao','snake'], ids);
  assert.deepEqual(favoritesOnly.order,['paopao','tetris','gomoku','snake','reversi']);
});

test('malformed partial or duplicate permutations cannot drop games', () => {
  const start = normalizeCatalogPreferences({},ids), visible = ['snake','paopao'];
  for (const permutation of [null, [], ['snake'], ['snake','snake'], ['paopao','missing'], ['snake','paopao','tetris']])
    assert.deepEqual(reorderVisibleIds(start,visible,permutation,ids),start);
});
