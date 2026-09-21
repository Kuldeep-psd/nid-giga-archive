const paths = {
  chevron: 'm7 10 5 5 5-5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  close: 'm6 6 12 12M6 18 18 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  minus: 'M5 12h14', plus: 'M12 5v14M5 12h14',
  list: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  moon: 'M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5a8.5 8.5 0 1 0 9.7 9.7Z',
};

export function Icon({ name, ...props }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    {name === 'grid' ? <>{[[3, 3], [14, 3], [3, 14], [14, 14]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="7" height="7" rx="1" />)}</>
      : name === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>
      : name === 'sun' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>
      : <path d={paths[name] || paths.arrow} />}
  </svg>;
}
