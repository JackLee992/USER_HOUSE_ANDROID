// Preferences belong to the existing settings backup, never a separate storage key.
const uniqueIds = value => Array.isArray(value)
  ? [...new Set(value.filter(id => typeof id === 'string' && /^[a-z0-9]+$/.test(id)))] : [];

export function normalizeCatalogPreferences(value, validIds) {
  const ids = uniqueIds(validIds), allowed = new Set(ids);
  const favorites = uniqueIds(value?.favorites).filter(id => allowed.has(id));
  const order = uniqueIds(value?.order).filter(id => allowed.has(id));
  const ordered = new Set(order);
  return {favorites, order:order.concat(ids.filter(id => !ordered.has(id)))};
}

export function toggleFavorite(preferences, id, validIds) {
  const next = normalizeCatalogPreferences(preferences, validIds);
  if (!next.order.includes(id)) return next;
  next.favorites = next.favorites.includes(id)
    ? next.favorites.filter(item => item !== id) : [...next.favorites, id];
  return next;
}

export function orderGameIds(preferences, validIds) {
  return normalizeCatalogPreferences(preferences, validIds).order;
}

export function reorderVisibleIds(preferences, visibleIds, reorderedIds, validIds) {
  const next = normalizeCatalogPreferences(preferences, validIds);
  const visible = new Set(uniqueIds(visibleIds).filter(id => next.order.includes(id)));
  if (!Array.isArray(reorderedIds) || reorderedIds.length !== visible.size ||
      new Set(reorderedIds).size !== visible.size || reorderedIds.some(id => !visible.has(id))) return next;
  let position = 0;
  next.order = next.order.map(id => visible.has(id) ? reorderedIds[position++] : id);
  return next;
}
