import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div
      className={[
        'fixed inset-x-0 top-0 z-50 flex justify-center transition-transform duration-300 ease-in-out',
        online ? '-translate-y-full' : 'translate-y-0'
      ].join(' ')}
    >
      <div className="mx-auto mt-2 flex max-w-md items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-800 shadow">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span>You are offline — map browsing still works</span>
      </div>
    </div>
  );
}

