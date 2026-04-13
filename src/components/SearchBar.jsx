import { useEffect, useRef, useState } from 'react';
import { search as runSearch } from '../services/searchService.js';

const CATEGORY_COLORS = {
  academic: '#378ADD',
  admin: '#7F77DD',
  amenity: '#1D9E75',
  hostel: '#BA7517',
  sports: '#D85A30'
};

function categoryDotStyle(category) {
  const color = CATEGORY_COLORS[category] || '#64748b';
  return { backgroundColor: color };
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function SearchBar({ index = [], onResultSelect, placeholder = 'Search buildings, rooms…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = runSearch(query, index, 6);
      setResults(next);
      setOpen(Boolean(query.trim()) && next.length > 0);
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, index]);

  function clearAll() {
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-primary">
        <span className="text-slate-500">
          <SearchIcon />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(results.length > 0)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              clearAll();
            }
          }}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder={placeholder}
        />
        {query.trim().length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear search"
          >
            <XIcon />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <ul className="max-h-72 overflow-auto py-1">
            {results.slice(0, 6).map((r) => (
              <li key={`${r.type}:${r.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => {
                    if (typeof onResultSelect === 'function') onResultSelect(r);
                    clearAll();
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={categoryDotStyle(r.category)}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{r.displayName}</span>
                    <span className="block truncate text-xs text-slate-500">{r.subtitle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

