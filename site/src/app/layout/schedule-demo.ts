import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

export interface ScheduleCopy {
  stages: string[]; types: { id: string; h: string; min: number }[]; chairs: string[]; patients: string[];
  nextStage: string; remove: string; busy: string; pick: string; empty: string; done: string; clickSlot: string; stageLabel: string;
}
interface Visit { id: number; who: number; type: string; chair: number; start: number; stage: number }
const FROM = 8 * 60, TO = 14 * 60, PX = 1.2; // minutes; 72 px per hour

/** A working, in-memory scheduling grid with made-up patients. Nothing is sent anywhere. */
@Component({
  selector: 'ds-schedule-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sd">
      <div class="grid" role="group" [attr.aria-label]="c().clickSlot">
        <div class="hours" aria-hidden="true">@for (h of hours; track h) { <span [style.top.px]="(h - from) * px">{{ label(h) }}</span> }</div>
        @for (ch of c().chairs; track ch; let ci = $index) {
          <div class="col" [style.--tone]="tones[ci]">
            <p class="colh">{{ ch }}</p>
            <div class="lane" (click)="slot($event, ci)" [style.height.px]="(to - from) * px">
              @for (h of hours; track h) { <i [style.top.px]="(h - from) * px"></i> }
              @for (v of byChair(ci); track v.id) {
                <button type="button" class="v" [class.is-sel]="sel() === v.id" [attr.data-stage]="v.stage" [style.top.px]="(v.start - from) * px" [style.height.px]="len(v) * px - 2" (click)="pick($event, v.id)">
                  <b>{{ c().patients[v.who % c().patients.length] }}</b><span>{{ label(v.start) }} · {{ typeName(v.type) }}</span><em>{{ c().stages[v.stage] }}</em>
                </button>
              }
            </div>
          </div>
        }
      </div>
      <aside class="side" aria-live="polite">
        @if (cur(); as v) {
          <h3>{{ c().patients[v.who % c().patients.length] }}</h3>
          <p class="meta">{{ typeName(v.type) }} · {{ c().chairs[v.chair] }} · {{ label(v.start) }}–{{ label(v.start + len(v)) }}</p>
          <ol class="stages">@for (s of c().stages; track s; let i = $index) { <li [class.on]="i <= v.stage" [class.now]="i === v.stage">{{ s }}</li> }</ol>
          @if (v.stage < c().stages.length - 1) { <button type="button" class="b b--solid" (click)="advance(v.id)">{{ c().nextStage }}: {{ c().stages[v.stage + 1] }}</button> } @else { <p class="meta">{{ c().done }}</p> }
          <button type="button" class="b" (click)="remove(v.id)">{{ c().remove }}</button>
        } @else {
          <p class="meta">{{ c().empty }}</p>
        }
        <label class="kind"><span>{{ c().pick }}</span>
          <select (change)="type.set($any($event.target).value)">@for (t of c().types; track t.id) { <option [value]="t.id" [selected]="type() === t.id">{{ t.h }} ({{ t.min }} min)</option> }</select>
        </label>
        <p class="hint" [class.warn]="!!msg()">{{ msg() || c().clickSlot }}</p>
      </aside>
    </div>`,
  styles: `
    :host { display: block; color: var(--ink); }
    .sd { display: grid; grid-template-columns: minmax(0, 1fr) 300px; border: 1px solid var(--rule); background: var(--bg); }
    .grid { position: relative; display: grid; grid-template-columns: 54px repeat(3, minmax(0, 1fr)); overflow: hidden; }
    .hours { position: relative; margin-top: 40px; } .hours span { position: absolute; right: 10px; transform: translateY(-50%); font: 400 12px/1 var(--mono); color: var(--mute); }
    .col { border-left: 1px solid var(--rule); } .colh { height: 40px; display: grid; place-items: center; font-weight: 600; font-size: 14px; border-bottom: 1px solid var(--rule); }
    .lane { position: relative; cursor: copy; } .lane i { position: absolute; left: 0; right: 0; border-top: 1px solid var(--rule); pointer-events: none; }
    .v { position: absolute; left: 4px; right: 4px; display: block; text-align: left; padding: 6px 8px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--tone) 35%, transparent); border-left: 3px solid var(--tone); border-radius: 4px; background: color-mix(in srgb, var(--tone) 11%, var(--bg)); color: var(--ink); font: 400 12px/1.3 var(--sans); cursor: pointer; transition: background-color .15s, opacity .15s; }
    .v b { display: block; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .v span, .v em { display: block; color: var(--mute); font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .v[data-stage='3'] { background: color-mix(in srgb, var(--tone) 28%, var(--bg)); } .v[data-stage='2'] { border-style: dashed; border-left-style: solid; } .v[data-stage='4'] { opacity: .55; }
    .v.is-sel { outline: 2px solid var(--ink); outline-offset: 1px; }
    .side { padding: 22px; border-left: 1px solid var(--rule); display: flex; flex-direction: column; gap: 12px; background: var(--bg2); }
    .side h3 { font-family: var(--sans); font-weight: 600; font-size: 1.2rem; letter-spacing: -.01em; } .meta { color: var(--mute); font-size: 14px; }
    .stages { list-style: none; margin: 4px 0; padding: 0; display: grid; gap: 6px; font-size: 13px; color: var(--mute); } .stages li::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; border: 1px solid currentColor; margin-right: 10px; }
    .stages li.on { color: var(--ink); } .stages li.on::before { background: var(--ink); } .stages li.now { font-weight: 600; }
    .b { min-height: 42px; padding: 0 16px; border: 1px solid var(--ink); border-radius: 2px; background: transparent; color: var(--ink); font: 500 14px/1 var(--sans); cursor: pointer; } .b--solid { background: var(--ink); color: var(--bg); } .b:hover { opacity: .85; }
    .kind { margin-top: auto; display: grid; gap: 6px; font-size: 13px; color: var(--mute); } .kind select { min-height: 40px; padding: 0 10px; border: 1px solid var(--rule); background: var(--bg); color: var(--ink); font: 400 14px var(--sans); border-radius: 2px; }
    .hint { font-size: 13px; color: var(--mute); } .hint.warn { color: #b42318; }
    @media (max-width: 900px) { .sd { grid-template-columns: 1fr; } .side { border-left: 0; border-top: 1px solid var(--rule); } }`,
})
export class ScheduleDemo {
  readonly c = input.required<ScheduleCopy>();
  protected readonly from = FROM; protected readonly to = TO; protected readonly px = PX;
  protected readonly hours = [8, 9, 10, 11, 12, 13, 14].map((h) => h * 60);
  protected readonly tones = ['#2563eb', '#8b5cf6', '#10b981'];
  protected readonly type = signal('consultation');
  protected readonly sel = signal<number | null>(2);
  protected readonly msg = signal('');
  private seq = 100;
  private readonly visits = signal<Visit[]>([
    { id: 1, who: 0, type: 'checkup', chair: 0, start: 8 * 60 + 30, stage: 4 }, { id: 2, who: 1, type: 'filling', chair: 0, start: 9 * 60 + 15, stage: 3 }, { id: 3, who: 2, type: 'cleaning', chair: 0, start: 11 * 60, stage: 1 },
    { id: 4, who: 3, type: 'orthodontics', chair: 1, start: 8 * 60 + 45, stage: 4 }, { id: 5, who: 4, type: 'consultation', chair: 1, start: 10 * 60, stage: 2 }, { id: 6, who: 5, type: 'orthodontics', chair: 1, start: 12 * 60, stage: 0 },
    { id: 7, who: 6, type: 'rootcanal', chair: 2, start: 8 * 60 + 30, stage: 4 }, { id: 8, who: 7, type: 'rootcanal', chair: 2, start: 10 * 60 + 15, stage: 3 }, { id: 9, who: 8, type: 'extraction', chair: 2, start: 12 * 60 + 30, stage: 1 },
  ]);
  protected readonly cur = computed(() => this.visits().find((v) => v.id === this.sel()) ?? null);
  protected byChair(ci: number): Visit[] { return this.visits().filter((v) => v.chair === ci); }
  protected typeMin(id: string): number { return this.c().types.find((t) => t.id === id)?.min ?? 30; }
  protected typeName(id: string): string { return this.c().types.find((t) => t.id === id)?.h ?? id; }
  protected len(v: Visit): number { return this.typeMin(v.type); }
  protected label(m: number): string { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  protected pick(e: Event, id: number): void { e.stopPropagation(); this.sel.set(id); this.msg.set(''); }
  protected advance(id: number): void { this.visits.update((l) => l.map((v) => (v.id === id ? { ...v, stage: Math.min(v.stage + 1, this.c().stages.length - 1) } : v))); }
  protected remove(id: number): void { this.visits.update((l) => l.filter((v) => v.id !== id)); this.sel.set(null); }
  protected slot(e: MouseEvent, chair: number): void {
    const lane = e.currentTarget as HTMLElement, y = e.clientY - lane.getBoundingClientRect().top;
    const start = Math.floor((FROM + y / PX) / 15) * 15, min = this.typeMin(this.type()), end = start + min;
    if (end > TO || this.visits().some((v) => v.chair === chair && start < v.start + this.len(v) && v.start < end)) { this.msg.set(this.c().busy); return; }
    const id = ++this.seq; this.visits.update((l) => [...l, { id, who: id, type: this.type(), chair, start, stage: 0 }]); this.sel.set(id); this.msg.set('');
  }
}
