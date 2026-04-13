export function buildSearchIndex(rooms = [], buildings = []) {
  const buildingById = new Map(
    (buildings || []).map((b) => [b.id, b])
  );

  function inferFloorNumber(room) {
    if (typeof room?.floorNumber === 'number') return room.floorNumber;
    if (typeof room?.floor === 'number') return room.floor;

    const floorId = typeof room?.floorId === 'string' ? room.floorId : '';
    const match = floorId.match(/_F(-?\d+)$/i);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }

    return null;
  }

  const buildingEntries = (buildings || []).map((b) => {
    const displayName = b?.name || b?.displayName || b?.title || 'Building';
    const category = b?.category || 'building';

    return {
      id: b?.id,
      type: 'building',
      displayName,
      subtitle: category ? `Building • ${category}` : 'Building',
      buildingId: b?.id ?? null,
      floorId: null,
      floorNumber: null,
      category,
      searchTags: Array.isArray(b?.searchTags) ? b.searchTags : [],
      department: b?.department || ''
    };
  });

  const roomEntries = (rooms || []).map((r) => {
    const building = r?.buildingId ? buildingById.get(r.buildingId) : null;
    const buildingName = building?.name || building?.displayName || '';
    const floorNumber = inferFloorNumber(r);

    const displayName =
      r?.name ||
      r?.displayName ||
      r?.roomName ||
      r?.roomNumber ||
      r?.code ||
      'Room';

    const subtitleParts = [];
    if (buildingName) subtitleParts.push(buildingName);
    if (floorNumber !== null) subtitleParts.push(`Floor ${floorNumber}`);
    if (r?.department) subtitleParts.push(r.department);

    const category = r?.category || 'room';

    return {
      id: r?.id,
      type: 'room',
      displayName,
      subtitle: subtitleParts.length ? subtitleParts.join(' • ') : 'Room',
      buildingId: r?.buildingId ?? null,
      floorId: r?.floorId ?? null,
      floorNumber,
      category,
      searchTags: Array.isArray(r?.searchTags) ? r.searchTags : [],
      department: r?.department || ''
    };
  });

  return [...buildingEntries, ...roomEntries].filter((e) => !!e.id);
}

export function search(queryText, index = [], limit = 6) {
  const raw = String(queryText ?? '');
  const q = raw.trim().toLowerCase();
  if (q.length < 2) return [];

  const scored = (index || [])
    .map((entry) => {
      const name = String(entry?.displayName ?? '').toLowerCase();
      const department = String(entry?.department ?? '').toLowerCase();
      const searchTags = Array.isArray(entry?.searchTags) ? entry.searchTags : [];
      const tags = searchTags.map((t) => String(t ?? '').toLowerCase()).filter(Boolean);

      let score = 0;
      if (name.startsWith(q)) score += 100;
      if (!name.startsWith(q) && name.includes(q)) score += 60;

      if (tags.some((t) => t === q)) score += 40;
      if (!tags.some((t) => t === q) && tags.some((t) => t.includes(q))) score += 20;

      if (department && department.includes(q)) score += 10;

      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);

  return scored;
}

export function filterByCategory(pois = [], category) {
  if (!category || category === 'all') return pois;
  return (pois || []).filter((poi) => poi?.category === category);
}

