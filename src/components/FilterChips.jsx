// d:\project\ProjectSE\src\components\FilterChips.jsx

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'departments', label: 'Departments' },
  { id: 'labs', label: 'Labs' },
  { id: 'library', label: 'Library' },
  { id: 'cafeteria', label: 'Cafeteria' },
  { id: 'medical', label: 'Medical' },
  { id: 'atm', label: 'ATM' },
  { id: 'hostel', label: 'Hostels' },
  { id: 'sports', label: 'Sports' }
];

export default function FilterChips({ activeCategory = 'all', onFilterChange }) {
  return (
    <div
      className="flex h-8 w-full items-center gap-2 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none' }}
    >
      <style>{`
        .chip-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="chip-scroll flex items-center gap-2">
        {CATEGORIES.map((c) => {
          const active = c.id === activeCategory;
          return (
            <button
              key={c.id}
              type="button"
              className={[
                'h-8 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition',
                active ? 'bg-primary text-white' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
              ].join(' ')}
              onClick={() => {
                if (typeof onFilterChange === 'function') onFilterChange(c.id);
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

