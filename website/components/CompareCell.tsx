export function CompareCell({ value, emphasize }: { value: string; emphasize?: boolean }) {
  const isYes = value === 'yes' || value.startsWith('yes');
  const isNo = value === 'no';

  if (isYes) {
    return (
      <span
        className={`inline-flex flex-col items-center gap-1 ${emphasize ? 'text-navy' : 'text-ink'}`}
      >
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
        {value !== 'yes' ? (
          <span className="text-sm font-medium leading-none">{value.replace(/^yes\s*/, '')}</span>
        ) : (
          <span className="sr-only">Yes</span>
        )}
      </span>
    );
  }

  if (isNo) {
    return (
      <span className="inline-flex justify-center text-muted" aria-label="No">
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 12h12" />
        </svg>
      </span>
    );
  }

  return <span className="text-sm leading-snug text-muted sm:text-base">{value}</span>;
}
