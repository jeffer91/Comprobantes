import { STATUS_LABELS, STATUS_TONES } from '../lib/constants'

export default function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status
  const tone = STATUS_TONES[status] || 'neutral'
  return <span className={`status-badge status-${tone}`}>{label}</span>
}
