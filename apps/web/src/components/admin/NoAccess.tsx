import { SECTIONS, Section } from '@/lib/admin';

/** Shown instead of a section the signed-in role cannot use; the API would refuse it anyway. */
export function NoAccess({ section }: { section: Section }) {
  const roles = ['SUPER_ADMIN', ...SECTIONS[section].roles].map((role) => role.replaceAll('_', ' ').toLowerCase());
  return (
    <div className="stack">
      <h1>{SECTIONS[section].label}</h1>
      <div className="notice warn" role="alert">
        Your role cannot open this section. It needs: {roles.join(' or ')}.
      </div>
    </div>
  );
}
