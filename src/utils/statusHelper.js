function parseRange(rangeStr) {
  const s = String(rangeStr || '').trim();
  if (!s || s.toLowerCase() === 'closed') return null;
  const [start, end] = s.split('-').map((x) => x?.trim());
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map((n) => Number(n));
  const [eh, em] = end.split(':').map((n) => Number(n));
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  return { startM: sh * 60 + sm, endM: eh * 60 + em };
}

function minsSinceMidnight(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function todayKey(d) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  if (day === 6) return 'saturday';
  if (day === 0) return 'sunday';
  return 'weekday';
}

export function getLiveStatus(hours) {
  const now = new Date();
  const key = todayKey(now);
  const range = parseRange(hours?.[key]);

  if (!range) {
    return { label: 'Closed today', colour: 'red' };
  }

  const nowM = minsSinceMidnight(now);
  const { startM, endM } = range;

  if (nowM < startM || nowM >= endM) {
    return { label: 'Closed now', colour: 'red' };
  }

  const minsLeft = Math.max(0, endM - nowM);
  if (minsLeft <= 45) {
    return { label: `Closes in ${minsLeft} min`, colour: 'amber' };
  }

  return { label: 'Open Now', colour: 'green' };
}

