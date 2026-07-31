import { highlight } from 'sugar-high';
import { java } from 'sugar-high/presets';

type CodeBlockProps = {
  code: string;
  className?: string;
};

/** Tiny sugar-high wrapper — java preset covers Kotlin-ish control flow. */
export function CodeBlock({ code, className }: CodeBlockProps) {
  const html = highlight(code, { ...java });
  return (
    <pre className={className}>
      <code
        className="font-mono text-[0.8rem] leading-relaxed sm:text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}
