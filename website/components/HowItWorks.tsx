import { CodeBlock } from '@/components/CodeBlock';
import { howItWorks, type SourceLinks } from '@/lib/content';

export function HowPipeline() {
  return (
    <div className="how-pipeline relative mx-auto w-full max-w-4xl">
      <p className="sr-only">
        Traffic flows from apps through a local VPN into the Lenswire proxy. The proxy either
        decrypts HTTPS with MITM for inspection, or relays a sealed byte tunnel when decryption is
        not possible. Results appear in the Lenswire UI.
      </p>
      <div aria-hidden="true">
        {/* Desktop: horizontal fork */}
        <svg
          className="hidden h-auto w-full sm:block"
          viewBox="0 0 900 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="how-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#48CAE4" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#90E0EF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#48CAE4" stopOpacity="0.35" />
            </linearGradient>
            <filter id="how-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Trunk: Apps → VPN → Proxy */}
          <path
            d="M70 110 H280"
            stroke="url(#how-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="how-pipeline-path"
          />
          <path
            d="M280 110 H420"
            stroke="url(#how-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="how-pipeline-path"
          />

          {/* Fork: MITM (upper) */}
          <path
            d="M420 110 C480 110 500 55 560 55 H700"
            stroke="#90E0EF"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="how-pipeline-path how-pipeline-decrypt"
            filter="url(#how-glow)"
          />
          {/* Fork: Tunnel (lower, dashed) */}
          <path
            d="M420 110 C480 110 500 165 560 165 H700"
            stroke="#48CAE4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="6 7"
            opacity="0.55"
            className="how-pipeline-path how-pipeline-tunnel"
          />

          {/* Merge → UI */}
          <path
            d="M700 55 C760 55 780 110 830 110"
            stroke="#90E0EF"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="how-pipeline-path how-pipeline-decrypt"
          />
          <path
            d="M700 165 C760 165 780 110 830 110"
            stroke="#48CAE4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="6 7"
            opacity="0.55"
            className="how-pipeline-path how-pipeline-tunnel"
          />

          {/* Packet on MITM path */}
          <circle r="5.5" fill="#E0FBFC" filter="url(#how-glow)" className="how-packet">
            <animateMotion
              dur="4.8s"
              repeatCount="indefinite"
              path="M70 110 H420 C480 110 500 55 560 55 H700 C760 55 780 110 830 110"
            />
          </circle>
          {/* Dimmer packet on tunnel path */}
          <circle r="4" fill="#48CAE4" opacity="0.7" className="how-packet">
            <animateMotion
              dur="5.6s"
              begin="1.2s"
              repeatCount="indefinite"
              path="M70 110 H420 C480 110 500 165 560 165 H700 C760 165 780 110 830 110"
            />
          </circle>

          {/* Stage labels */}
          <StageDot cx={70} cy={110} label="Apps" />
          <StageDot cx={280} cy={110} label="VPN" />
          <StageDot cx={420} cy={110} label="Local proxy" />
          <StageDot cx={700} cy={55} label="MITM" accent />
          <StageDot cx={700} cy={165} label="Tunnel" muted />
          <StageDot cx={830} cy={110} label="UI" />
        </svg>

        {/* Mobile: vertical */}
        <svg
          className="mx-auto block h-auto w-full max-w-xs sm:hidden"
          viewBox="0 0 280 520"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="how-line-m" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#48CAE4" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#90E0EF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#48CAE4" stopOpacity="0.35" />
            </linearGradient>
            <filter id="how-glow-m" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d="M140 40 V160"
            stroke="url(#how-line-m)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M140 160 V240"
            stroke="url(#how-line-m)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M140 240 C140 280 70 300 70 340 V400"
            stroke="#90E0EF"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#how-glow-m)"
          />
          <path
            d="M140 240 C140 280 210 300 210 340 V400"
            stroke="#48CAE4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="6 7"
            opacity="0.55"
          />
          <path
            d="M70 400 C70 440 140 460 140 480"
            stroke="#90E0EF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M210 400 C210 440 140 460 140 480"
            stroke="#48CAE4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="6 7"
            opacity="0.55"
          />

          <circle r="5" fill="#E0FBFC" filter="url(#how-glow-m)" className="how-packet">
            <animateMotion
              dur="5s"
              repeatCount="indefinite"
              path="M140 40 V240 C140 280 70 300 70 340 V400 C70 440 140 460 140 480"
            />
          </circle>
          <circle r="3.5" fill="#48CAE4" opacity="0.7" className="how-packet">
            <animateMotion
              dur="5.8s"
              begin="1.4s"
              repeatCount="indefinite"
              path="M140 40 V240 C140 280 210 300 210 340 V400 C210 440 140 460 140 480"
            />
          </circle>

          <StageDot cx={140} cy={40} label="Apps" />
          <StageDot cx={140} cy={160} label="VPN" />
          <StageDot cx={140} cy={240} label="Local proxy" />
          <StageDot cx={70} cy={400} label="MITM" accent />
          <StageDot cx={210} cy={400} label="Tunnel" muted />
          <StageDot cx={140} cy={480} label="UI" />
        </svg>
      </div>
    </div>
  );
}

function StageDot({
  cx,
  cy,
  label,
  accent = false,
  muted = false,
}: {
  cx: number;
  cy: number;
  label: string;
  accent?: boolean;
  muted?: boolean;
}) {
  const fill = accent ? '#E0FBFC' : muted ? '#48CAE4' : '#90E0EF';
  const opacity = muted ? 0.7 : 1;
  return (
    <g opacity={opacity} className="how-stage">
      <circle cx={cx} cy={cy} r="7" fill={fill} />
      <circle
        cx={cx}
        cy={cy}
        r="11"
        stroke={fill}
        strokeOpacity="0.35"
        strokeWidth="1.5"
        fill="none"
      />
      <text
        x={cx}
        y={cy + 28}
        textAnchor="middle"
        fill="rgba(255,255,255,0.78)"
        fontSize="13"
        fontFamily="var(--font-outfit), ui-sans-serif, system-ui, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

function SourcePair({
  sources,
  className,
  prefix,
}: {
  sources: SourceLinks;
  className: string;
  prefix?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      {prefix ? <span>{prefix}</span> : null}
      <a
        href={sources.android}
        className="no-underline transition"
        target="_blank"
        rel="noopener noreferrer"
      >
        Android →
      </a>
      <a
        href={sources.ios}
        className="no-underline transition"
        target="_blank"
        rel="noopener noreferrer"
      >
        iOS →
      </a>
    </span>
  );
}

export function HowFork() {
  const { fork } = howItWorks;
  return (
    <div className="how-fork mx-auto max-w-2xl">
      <div className="text-center">
        <p className="text-base font-medium tracking-wide text-navy">{fork.intro}</p>
        <h2 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">{fork.heading}</h2>
        <p className="mt-5 text-lg leading-relaxed text-muted sm:text-xl">{fork.lead}</p>
      </div>
      <CodeBlock
        code={fork.code}
        className="how-code mt-10 overflow-x-auto rounded-2xl bg-ink px-5 py-5 text-left sm:px-6 sm:py-6"
      />
      <p className="mt-4 text-center font-mono text-sm text-navy/70">
        <SourcePair
          sources={fork.sources}
          className="justify-center [&_a]:text-navy/70 [&_a]:hover:text-navy"
          prefix={`${fork.sourceLabel} ·`}
        />
      </p>
    </div>
  );
}

type ProtocolItem = {
  label: string;
  body: string;
  code: string;
  sources?: SourceLinks;
};

export function HowProtocols() {
  const { mitm, tunnel, protocolsIntro, protocolsHeading, protocolsLead } = howItWorks;
  return (
    <div className="how-protocols">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-base font-medium tracking-wide text-navy">{protocolsIntro}</p>
        <h2 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
          {protocolsHeading}
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted sm:text-xl">{protocolsLead}</p>
      </div>

      <div className="relative mx-auto mt-16 grid max-w-5xl gap-12 lg:mt-20 lg:grid-cols-2 lg:gap-0">
        {/* Fork spine — desktop only */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-2 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-cyan/50 via-line to-navy/25 lg:block"
        />

        <ProtocolLane
          eyebrow="MITM path"
          title={mitm.title}
          lead={mitm.lead}
          items={mitm.items}
          tone="mitm"
        />
        <ProtocolLane
          eyebrow="Passthrough path"
          title={tunnel.title}
          lead={tunnel.lead}
          items={tunnel.items}
          tone="tunnel"
        />
      </div>
    </div>
  );
}

function ProtocolLane({
  eyebrow,
  title,
  lead,
  items,
  tone,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  items: readonly ProtocolItem[];
  tone: 'mitm' | 'tunnel';
}) {
  const isMitm = tone === 'mitm';
  return (
    <div className={`how-protocol-lane ${isMitm ? 'lg:pr-14' : 'lg:pl-14'}`}>
      <p
        className={`text-sm font-medium uppercase tracking-[0.14em] ${
          isMitm ? 'text-cyan' : 'text-navy/55'
        }`}
      >
        {eyebrow}
      </p>
      <h3
        className={`mt-3 font-display text-4xl tracking-tight sm:text-5xl ${
          isMitm ? 'text-ink' : 'text-ink/75'
        }`}
      >
        {title}
      </h3>
      <p
        className={`mt-3 max-w-md text-lg leading-snug sm:text-xl ${
          isMitm ? 'text-navy' : 'text-muted'
        }`}
      >
        {lead}
      </p>

      <ul className="mt-10 space-y-0">
        {items.map((item, i) => (
          <li
            key={item.code}
            className={`how-protocol-item group relative border-l-2 py-5 pl-5 transition-[border-color] duration-300 sm:pl-6 ${
              isMitm
                ? 'border-cyan/40 hover:border-cyan'
                : 'border-dashed border-navy/20 hover:border-navy/45'
            } ${i === 0 ? 'pt-0' : ''} ${i === items.length - 1 ? 'pb-0' : ''}`}
            style={{ animationDelay: `${0.08 * i}s` }}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
                {item.label}
              </p>
              <code
                className={`font-mono text-[0.7rem] tracking-wide sm:text-xs ${
                  isMitm ? 'text-cyan' : 'text-navy/50'
                }`}
              >
                {item.code}
              </code>
              {item.sources ? (
                <SourcePair
                  sources={item.sources}
                  className={`font-mono text-[0.7rem] tracking-wide sm:text-xs ${
                    isMitm
                      ? '[&_a]:text-cyan/70 [&_a]:hover:text-cyan'
                      : '[&_a]:text-navy/40 [&_a]:hover:text-navy/70'
                  }`}
                />
              ) : null}
            </div>
            <p className="mt-2 max-w-md text-base leading-relaxed text-muted sm:text-lg">
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
