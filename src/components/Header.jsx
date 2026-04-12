// d:\project\ProjectSE\src\components\Header.jsx
export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white">
            <span className="text-sm font-bold">DIT</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">DIT Campus Map</div>
            <div className="text-xs text-slate-500">Smart Campus Navigation (PWA)</div>
          </div>
        </div>
        <a
          className="text-xs font-medium text-primary hover:underline"
          href="https://www.dituniversity.edu.in/"
          target="_blank"
          rel="noreferrer"
        >
          DIT University
        </a>
      </div>
    </header>
  );
}

