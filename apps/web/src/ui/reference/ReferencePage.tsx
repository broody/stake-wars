import { useId, useRef, useState, type ReactNode } from 'react';
import { Badge } from '../Badge';
import { Button, CloseButton } from '../Button';
import { Callout } from '../Callout';
import { ColumnChart, Sparkline, TimeSeriesChart } from '../charts/charts';
import { Dialog, DialogHeader } from '../Dialog';
import { ExternalLink } from '../Links';
import { Panel, PanelSection } from '../Panel';
import { SegmentedControl } from '../SegmentedControl';
import { Spinner } from '../Spinner';
import { Stat, StatGrid } from '../Stat';
import {
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../Table';
import {
  backgroundImage,
  boxShadow,
  chartColors,
  colors,
  fontSize,
  letterSpacing,
} from '../tokens';
import { Eyebrow, PageTitle, SectionHeading } from '../Typography';
import {
  buttonStyles,
  fieldStyles,
  panelStyles,
  textLinkStyles,
  type ButtonSize,
  type ButtonVariant,
  type PanelTone,
  type Tone,
} from '../styles';

const tones: Tone[] = ['neutral', 'accent', 'gold', 'warning', 'danger'];
const variants: ButtonVariant[] = ['solid', 'outline', 'ghost', 'link'];
const sizes: ButtonSize[] = ['sm', 'md', 'lg', 'xl'];
const panelTones: PanelTone[] = [
  'default',
  'strong',
  'floating',
  'floating-gold',
  'floating-warning',
  'accent',
  'gold',
  'warning',
  'danger',
];

const DAY = 86_400;
const start = Date.UTC(2026, 0, 1) / 1_000;
const series = Array.from({ length: 120 }, (_, index) => ({
  t: start + index * DAY,
  v: 1_000_000 + index * 9_000 + Math.sin(index / 6) * 60_000,
}));
const columns = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(
  (label, index) => ({
    key: label,
    label,
    value: [12, 4, 30, 8, 0, 16, 6][index] * 1_000,
    detail: `${[3, 1, 9, 2, 0, 4, 1][index]} EXITS`,
  })
);

/** Flattens `{ fg: { DEFAULT, muted } }` into `fg`, `fg-muted`. */
function colorEntries(): Array<[string, string]> {
  return Object.entries(colors).flatMap(([name, value]) =>
    typeof value === 'string'
      ? [[name, value] as [string, string]]
      : Object.entries(value).map(
          ([step, hex]) =>
            [step === 'DEFAULT' ? name : `${name}-${step}`, hex] as [
              string,
              string,
            ]
        )
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <SectionHeading id={id} eyebrow="SRC/UI" title={title} />
      {note ? (
        <p className="mt-2 max-w-3xl text-caption text-fg-subtle">{note}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="text-tag text-fg-subtle">{children}</code>;
}

const contents = [
  ['type', 'TYPE'],
  ['color', 'COLOR'],
  ['buttons', 'BUTTONS'],
  ['panels', 'PANELS'],
  ['text', 'HEADINGS & LINKS'],
  ['stats', 'STATS'],
  ['controls', 'CONTROLS'],
  ['status', 'BADGES & CALLOUTS'],
  ['table', 'TABLE'],
  ['dialog', 'DIALOG'],
  ['charts', 'CHARTS'],
  ['effects', 'SHADOWS & WASHES'],
] as const;

/**
 * The living reference for the Stake Wars design system, served unlisted at
 * /play/ui. It renders straight from tokens.ts and the components, so it is
 * always what the product actually uses.
 */
export function ReferencePage() {
  const [segment, setSegment] = useState<'30d' | '90d' | 'all'>('90d');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="h-full w-full overflow-y-auto bg-surface font-mono">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 sm:pt-24">
        <header className="border-b border-line pb-6">
          <Eyebrow>STAKE WARS DESIGN SYSTEM · UNLISTED</Eyebrow>
          <PageTitle className="mt-3">UI REFERENCE</PageTitle>
          <p className="mt-4 max-w-3xl text-body text-fg-muted">
            Every token and component in <Code>apps/web/src/ui</Code>. Build
            from these; when something is missing, add it to the library and to
            this page rather than improvising inside a feature. Lint rule{' '}
            <Code>stakewars/no-adhoc-styles</Code> enforces it.
          </p>
          <nav aria-label="Sections" className="mt-5 flex flex-wrap gap-2">
            {contents.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={buttonStyles({ size: 'sm', variant: 'outline' })}
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <div className="mt-10 space-y-16">
          <Section
            id="type"
            title="TYPE ROLES"
            note="Each role sets size, line height and letter spacing together. Nothing renders below text-tag (11px)."
          >
            <Panel>
              {Object.entries(fontSize).map(([role, [size, options]]) => (
                <div
                  key={role}
                  className="grid gap-2 border-b border-line px-5 py-4 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)] md:items-baseline"
                >
                  <div>
                    <div className="text-label text-fg">text-{role}</div>
                    <Code>
                      {size} · {options.lineHeight} · {options.letterSpacing}
                    </Code>
                  </div>
                  <div
                    className={`text-${role} min-w-0 truncate text-fg-secondary`}
                  >
                    {role === 'ghost' ? '07' : 'STAKE STRK · 1,234.56'}
                  </div>
                </div>
              ))}
            </Panel>
            <div className="mt-4 flex flex-wrap gap-6 text-body text-fg-muted">
              {Object.entries(letterSpacing).map(([name, value]) => (
                <span key={name}>
                  <span className={`tracking-${name} text-fg`}>
                    TRACKING-{name.toUpperCase()}
                  </span>{' '}
                  <Code>{value}</Code>
                </span>
              ))}
            </div>
          </Section>

          <Section
            id="color"
            title="COLOR"
            note="Pick the role, not the shade. Tailwind's default palette is not available. Status colors always ship with a word."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {colorEntries()
                .filter(([, value]) => value.startsWith('#'))
                .map(([name, value]) => (
                  <div key={name} className="border border-line p-3">
                    <div
                      className="h-10 border border-line"
                      style={{ background: value }}
                    />
                    <div className="mt-2 text-label text-fg">{name}</div>
                    <Code>{value}</Code>
                  </div>
                ))}
            </div>
          </Section>

          <Section
            id="buttons"
            title="BUTTONS"
            note={
              <>
                <Code>{'<Button variant tone size busy fullWidth>'}</Code>. For
                a router Link that looks like a button, pass{' '}
                <Code>buttonStyles()</Code> as its className.
              </>
            }
          >
            <Panel className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell className="pl-5">VARIANT</TableHeaderCell>
                    {tones.map((tone) => (
                      <TableHeaderCell key={tone}>{tone}</TableHeaderCell>
                    ))}
                  </tr>
                </TableHead>
                <tbody>
                  {variants.map((variant) => (
                    <TableRow key={variant}>
                      <TableCell className="pl-5 text-label">
                        {variant}
                      </TableCell>
                      {tones.map((tone) => (
                        <TableCell key={tone} className="py-4">
                          <Button variant={variant} tone={tone}>
                            {tone === 'danger' ? 'CAPTURE' : 'STAKE'}
                          </Button>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </Panel>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {sizes.map((size) => (
                <Button key={size} size={size} variant="solid">
                  SIZE {size}
                </Button>
              ))}
              <Button
                busy={busy}
                onClick={() => {
                  setBusy(true);
                  window.setTimeout(() => setBusy(false), 2_000);
                }}
              >
                {busy ? 'CONFIRMING…' : 'BUSY ON CLICK'}
              </Button>
              <Button disabled>DISABLED</Button>
              <Button variant="solid" disabled>
                ENTER STRK AMOUNT
              </Button>
              <CloseButton label="Close example" />
              <CloseButton size="sm" label="Dismiss example" />
            </div>
            <p className="mt-3 text-caption text-fg-subtle">
              Disabled buttons stay legible because they often state why; hover
              styles use the <Code>hover-enabled:</Code> variant so they never
              react while disabled.
            </p>
          </Section>

          <Section
            id="panels"
            title="PANELS"
            note={
              <>
                <Code>{'<Panel tone>'}</Code> with{' '}
                <Code>{'<PanelSection>'}</Code> bands. Use <Code>floating</Code>{' '}
                over the 3D Core.
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {panelTones.map((tone) => (
                <div key={tone} className={panelStyles(tone, 'p-4')}>
                  <Eyebrow>PANEL</Eyebrow>
                  <div className="mt-1 text-heading text-fg">{tone}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="text" title="HEADINGS & LINKS">
            <Panel>
              <PanelSection>
                <SectionHeading
                  eyebrow="EYEBROW · CONTEXT"
                  title="SECTION HEADING"
                >
                  <Button size="sm">ACTION</Button>
                </SectionHeading>
              </PanelSection>
              <PanelSection className="flex flex-wrap gap-6">
                {tones.map((tone) => (
                  <Eyebrow key={tone} tone={tone} dot>
                    EYEBROW {tone}
                  </Eyebrow>
                ))}
              </PanelSection>
              <PanelSection className="space-y-2 text-body text-fg-secondary">
                <p>
                  Inline{' '}
                  <a href="#text" className={textLinkStyles()}>
                    text link
                  </a>{' '}
                  and an{' '}
                  <ExternalLink href="https://voyager.online">
                    external link
                  </ExternalLink>{' '}
                  inside body copy.
                </p>
                <p>
                  <ExternalLink quiet href="https://voyager.online">
                    QUIET EXTERNAL LINK
                  </ExternalLink>{' '}
                  for tables and headers.
                </p>
              </PanelSection>
            </Panel>
          </Section>

          <Section
            id="stats"
            title="STATS"
            note={
              <>
                <Code>{'<StatGrid>'}</Code> draws hairlines between{' '}
                <Code>{'<Stat>'}</Code> cells.
              </>
            }
          >
            <Panel>
              <StatGrid className="grid-cols-2 lg:grid-cols-4">
                <Stat
                  label="TOTAL STAKED"
                  value="1.59B"
                  unit="STRK"
                  detail="≈ $67.8M"
                  emphasis
                />
                <Stat label="VALIDATORS" value="140" detail="11 EXITING" />
                <Stat
                  label="PENDING UNSTAKE"
                  value="83.59M"
                  unit="STRK"
                  tone="warning"
                />
                <Stat
                  label="SPONSOR"
                  value="0x06e2d33ac9878de85acc676347f6bd97a860376f"
                  wrap
                />
              </StatGrid>
            </Panel>
            <Panel tone="accent" className="mt-4">
              <StatGrid tone="accent" className="grid-cols-2 lg:grid-cols-4">
                <Stat label="OUR STAKE" value="935K" unit="STRK" emphasis />
                <Stat label="DELEGATORS" value="20" />
                <Stat label="POWER" value="0.044%" />
                <Stat label="APR" value="6.84%" />
              </StatGrid>
            </Panel>
          </Section>

          <Section id="controls" title="CONTROLS">
            <div className="flex flex-wrap items-center gap-6">
              <SegmentedControl
                label="Range"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: '30d', label: '30D' },
                  { value: '90d', label: '90D' },
                  { value: 'all', label: 'ALL' },
                ]}
              />
              <span className="flex items-center gap-2 text-label text-fg-muted">
                <Spinner /> SPINNER
              </span>
            </div>
            <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-label text-fg-subtle">FIELD SM</span>
                <select
                  className={fieldStyles({ size: 'sm', className: 'mt-2' })}
                >
                  <option>ALL EVENTS</option>
                  <option>CAPTURES</option>
                </select>
              </label>
              <label className="block">
                <span className="text-label text-fg-subtle">FIELD MD</span>
                <input
                  className={fieldStyles({ className: 'mt-2' })}
                  placeholder="https://"
                />
              </label>
              <label className="block">
                <span className="text-label text-fg-subtle">
                  FIELD LG · GOLD
                </span>
                <input
                  className={fieldStyles({
                    size: 'lg',
                    tone: 'gold',
                    className: 'mt-2',
                  })}
                  placeholder="0.00"
                />
              </label>
            </div>
          </Section>

          <Section
            id="status"
            title="BADGES & CALLOUTS"
            note="Status colors carry a word or icon, never color alone."
          >
            <div className="flex flex-wrap gap-2">
              {[...tones, 'success' as const].map((tone) => (
                <Badge key={tone} tone={tone}>
                  {tone}
                </Badge>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...tones, 'success' as const].map((tone) => (
                <Badge key={tone} tone={tone} variant="solid">
                  {tone}
                </Badge>
              ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[...tones, 'success' as const].map((tone) => (
                <Callout
                  key={tone}
                  tone={tone}
                  title={`${tone.toUpperCase()} CALLOUT`}
                >
                  A short explanation of what happened and what to do next.
                </Callout>
              ))}
            </div>
          </Section>

          <Section id="table" title="TABLE">
            <Panel className="overflow-x-auto">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell className="pl-5">
                      VALIDATOR
                    </TableHeaderCell>
                    <TableHeaderCell numeric>STAKE</TableHeaderCell>
                    <TableHeaderCell numeric className="pr-5">
                      APR
                    </TableHeaderCell>
                  </tr>
                </TableHead>
                <tbody>
                  {[
                    ['STAKE//WARS', '935,290', '6.84%'],
                    ['0x04a1…9c2e', '48,120,500', '6.46%'],
                    ['0x07f3…11d0', '12,004', '7.21%'],
                  ].map(([name, stake, apr]) => (
                    <TableRow key={name}>
                      <TableCell className="pl-5">{name}</TableCell>
                      <TableCell numeric>{stake}</TableCell>
                      <TableCell numeric className="pr-5">
                        {apr}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </Panel>
          </Section>

          <Section id="dialog" title="DIALOG">
            <Button onClick={() => setDialogOpen(true)}>OPEN DIALOG</Button>
            <Dialog
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              labelledBy={titleId}
              initialFocus={confirmRef}
              size="sm"
            >
              <DialogHeader
                titleId={titleId}
                eyebrow={<span className="text-warning">CONFIRM</span>}
                title="SPLIT INTO 3 TRANSACTIONS"
                onClose={() => setDialogOpen(false)}
              />
              <div className="space-y-4 px-5 py-5">
                <p className="text-caption text-fg-muted">
                  Escape or a backdrop click closes it; focus returns to the
                  button that opened it.
                </p>
                <div className="flex gap-3">
                  <Button
                    ref={confirmRef}
                    variant="solid"
                    onClick={() => setDialogOpen(false)}
                  >
                    CONTINUE
                  </Button>
                  <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                    CANCEL
                  </Button>
                </div>
              </div>
            </Dialog>
          </Section>

          <Section
            id="charts"
            title="CHARTS"
            note={
              <>
                <Code>src/ui/charts</Code>: single series, one axis, 2px lines,
                crosshair and keyboard reading. Colors come from{' '}
                <Code>chartColors</Code> and follow the entity.
              </>
            }
          >
            <div className="flex flex-wrap gap-4">
              {Object.entries(chartColors).map(([name, value]) => (
                <span
                  key={name}
                  className="flex items-center gap-2 text-label text-fg-muted"
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 border border-line-strong"
                    style={{ background: value }}
                  />
                  {name}
                </span>
              ))}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <Eyebrow className="mb-3">TIME SERIES</Eyebrow>
                <TimeSeriesChart
                  points={series}
                  color={chartColors.network}
                  seriesLabel="STRK STAKED"
                  formatValue={(value) => `${(value / 1_000_000).toFixed(2)}M`}
                  height={180}
                />
              </Panel>
              <Panel className="p-4">
                <Eyebrow className="mb-3">COLUMNS</Eyebrow>
                <ColumnChart
                  data={columns}
                  color={chartColors.pending}
                  formatValue={(value) => `${value / 1_000}K STRK`}
                />
              </Panel>
              <Panel tone="accent" className="p-4 lg:col-span-2">
                <Eyebrow tone="accent" className="mb-3">
                  SPARKLINE
                </Eyebrow>
                <Sparkline
                  points={series}
                  color={chartColors.featured}
                  label="Example stake trend"
                />
              </Panel>
            </div>
          </Section>

          <Section id="effects" title="SHADOWS & WASHES">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Object.keys(boxShadow).map((name) => (
                <div
                  key={name}
                  className={`shadow-${name} border border-line-strong bg-surface p-4`}
                >
                  <div className="text-label text-fg">shadow-{name}</div>
                </div>
              ))}
              {Object.keys(backgroundImage).map((name) => (
                <div
                  key={name}
                  className={`bg-${name} h-24 border border-line p-4`}
                >
                  <div className="text-label text-fg">bg-{name}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
