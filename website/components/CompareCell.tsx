export function CompareCell({ value, emphasize }: { value: string; emphasize?: boolean }) {
  const isYes = value === 'yes' || value.startsWith('yes ');
  const isNo = value === 'no' || value.startsWith('no ');

  if (isYes) {
    const note = value !== 'yes' ? value.replace(/^yes\s*/, '') : null;
    return (
      <span
        className={`inline-flex flex-col items-center gap-0.5 ${
          emphasize ? 'font-medium text-navy' : 'text-ink'
        }`}
      >
        <span>Yes</span>
        {note ? <span className="text-xs font-normal text-muted">{note}</span> : null}
      </span>
    );
  }

  if (isNo) {
    const note = value !== 'no' ? value.replace(/^no\s*/, '') : null;

    return (
      <span className="inline-flex flex-col items-center gap-0.5 text-muted">
        <span aria-label="No">—</span>
        {note ? <span className="text-xs font-normal">{note}</span> : null}
      </span>
    );
  }

  return <span className="text-sm leading-snug text-muted sm:text-base">{value}</span>;
}
