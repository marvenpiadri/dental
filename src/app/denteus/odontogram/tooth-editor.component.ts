import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import type { ToothRecord } from './engine/chart';
import { SURFACES, type EnumField, type FlagField, type ToothEdit } from './engine/edits';
import type { ChartMode } from './engine/plan';
import { RESTORATION_MATRIX } from './engine/vendor/registry/restorations';
import * as V from './engine/vendor/state/payload';
import { label } from './labels';

const list = (s: Set<string>, skip: string[] = []): string[] => [...s].filter((v) => !skip.includes(v));
type Restorations = Record<string, { materials: readonly string[] }>;

/** Editing panel for the selected teeth. Emits edits; never changes a chart itself. */
@Component({
  selector: 'den-tooth-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tooth-editor.component.html',
  styleUrl: './tooth-editor.component.css',
})
export class ToothEditorComponent {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  readonly state = input.required<ToothRecord>();
  readonly teeth = input.required<readonly number[]>();
  readonly mode = input<ChartMode>('status');
  readonly disabled = input(false);
  readonly edit = output<ToothEdit>();

  protected readonly surfaces = SURFACES;
  protected readonly selection = list(V.VALID_TOOTH_SELECTION);
  protected readonly substrates = list(V.VALID_TOOTH_SUBSTRATE);
  protected readonly restorationTypes = Object.keys(RESTORATION_MATRIX);
  protected readonly prostheses = list(V.VALID_PROSTHESIS, ['none']);
  protected readonly fillingMaterials = list(V.VALID_FILLING_MATERIAL, ['none']);
  protected readonly pulp = list(V.VALID_PULP_DX);
  protected readonly endo = list(V.VALID_ENDO);
  protected readonly apical = list(V.VALID_APICAL_DX);
  protected readonly lesion = list(V.VALID_PERIAPICAL_TYPE);
  protected readonly mobility = list(V.VALID_MOBILITY);
  protected readonly resorption = list(V.VALID_RESORPTION_TYPE);
  protected readonly rootCaries = list(V.VALID_ROOT_CARIES);
  protected readonly wearEdge = list(V.VALID_WEAR_EDGE);
  protected readonly wearCervical = list(V.VALID_WEAR_CERVICAL);
  protected readonly discoloration = list(V.VALID_DISCOLORATION);
  protected readonly orthoAppliance = list(V.VALID_ORTHO_APPLIANCE);
  protected readonly orthoDrift = list(V.VALID_ORTHO_DRIFT);
  protected readonly orthoVertical = list(V.VALID_ORTHO_VERTICAL);
  protected readonly periImplant = list(V.VALID_PERI_IMPLANT);
  protected readonly defects = list(V.VALID_FILLING_DEFECT);

  protected readonly sel = computed(() => String(this.state().toothSelection));
  protected readonly present = computed(() => this.sel() !== 'none' && this.sel() !== 'no-tooth-after-extraction');
  protected readonly natural = computed(() => this.sel() === 'tooth-base' || this.sel() === 'milktooth');
  protected readonly restType = computed(() => String(this.state().restorationType));
  protected readonly restMaterials = computed(() => [...((RESTORATION_MATRIX as Restorations)[this.restType()]?.materials ?? [])]);

  protected name(code: string): string { return label(code, this.i18n.lang()); }
  protected value(e: Event): string { return (e.target as HTMLSelectElement | HTMLInputElement).value; }
  protected checked(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected has(set: unknown, v: string): boolean { return set instanceof Set && set.has(v); }
  protected field(f: string): string { return String((this.state() as Record<string, unknown>)[f]); }
  protected flag(f: FlagField): boolean { return (this.state() as Record<string, unknown>)[f] === true; }

  protected setEnum(field: EnumField, e: Event): void { this.edit.emit({ kind: 'enum', field, value: this.value(e) }); }
  protected setFlag(field: FlagField, e: Event): void { this.edit.emit({ kind: 'flag', field, on: this.checked(e) }); }
  protected setType(e: Event): void {
    const type = this.value(e);
    if (type === 'none') { this.edit.emit({ kind: 'restoration', value: 'none|none' }); return; }
    const allowed = [...((RESTORATION_MATRIX as Restorations)[type]?.materials ?? [])];
    const cur = String(this.state().restorationMaterial);
    this.edit.emit({ kind: 'restoration', value: `${type}|${allowed.includes(cur) ? cur : allowed[0]}` });
  }
  protected setMaterial(e: Event): void { this.edit.emit({ kind: 'restoration', value: `${this.restType()}|${this.value(e)}` }); }
  protected setProsthesis(e: Event): void {
    const v = this.value(e);
    if (v === 'none') { if (this.field('prosthesis') !== 'none') this.edit.emit({ kind: 'restoration', value: 'none|none' }); } else this.edit.emit({ kind: 'restoration', value: `prosthesis|${v}` });
  }
  protected cariesOn(s: string): boolean { return this.has(this.state().caries, `caries-${s}`); }
  protected filledWith(s: string): string | null { const m = this.state().fillingSurfaceMaterials; return m instanceof Map ? (m.get(s) as string | undefined) ?? null : null; }
  protected defect(s: string): string { const m = this.state().fillingDefect; return m instanceof Map ? (m.get(s) as string | undefined) ?? 'none' : 'none'; }
  protected severity(s: string): number { const m = this.state().cariesSeverity; return m instanceof Map ? (m.get(s) as number | undefined) ?? 0 : 0; }
}
