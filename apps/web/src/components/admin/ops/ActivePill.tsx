/** Active / inactive flag as a pill, with the wording the screen needs. */
export function ActivePill({ active, on = 'active', off = 'inactive' }: { active: boolean; on?: string; off?: string }) {
  return <span className={`pill${active ? ' ok' : ''}`}>{active ? on : off}</span>;
}
