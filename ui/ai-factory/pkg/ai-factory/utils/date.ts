import dayjs from 'dayjs';

// Matches Rancher's own Apps Charts page (chart.vue::formatVersionDate)
// which hardcodes `MMM D, YYYY` for the visible date and only uses the
// user's DATE_FORMAT pref in tooltips. Adopting the same pattern here
// keeps publishedAt rendering visually consistent across the dashboard.
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = dayjs(iso);

  if (!d.isValid()) return '—';

  return d.format('MMM D, YYYY');
}
