export function formatSessionDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(date);
  const day = date.getDate();
  const month = new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const capWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');
  const cleanMonth = month.replace('.', '');
  return `${capWeekday} ${day} ${cleanMonth} · ${time} hs`;
}

export function formatShortDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
