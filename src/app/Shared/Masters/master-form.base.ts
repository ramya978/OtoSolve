import { Directive, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FieldDef, FormValues, IconName, MasterConfig, MasterRow, Option, Preview } from './masters.types';
import { MASTER_ICONS } from './masters-icons';
import { MastersStore } from './masters.store';

interface FieldError {
  key: string;
  label: string;
  text: string;
}

/**
 * Shared behaviour of the five master CREATE / EDIT pages, in the Workspace Kit "horizontal
 * register" pattern: values, validation rules, required progress, live preview, dependent
 * dropdowns, Load example, Reset, Cancel (with a discard check) and Create / Save.
 * Each page (country-form.ts …) is its own component with its own template listing its fields;
 * it says which master it edits and gives its example:
 *   protected override readonly cfg = COUNTRY;   protected readonly example = { … };
 * Templates address fields by key: value('name'), err('name'), onInput('name', $event) …
 */
@Directive()
export abstract class MasterFormBase implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly store = inject(MastersStore);

  /** The master this page edits (set by each page). */
  protected abstract readonly cfg: MasterConfig;
  /** "Load example" values (fictional, valid against every rule). */
  protected abstract readonly example: FormValues;

  /** Record being edited (null = new), resolved from the :id route parameter. */
  protected editing: MasterRow | null = null;
  private initial: FormValues = {};
  private fieldMap = new Map<string, FieldDef>();
  protected fields: FieldDef[] = [];
  protected requiredFields: FieldDef[] = [];

  protected readonly values = signal<FormValues>({});
  /** Fields the user has left at least once; errors show for these (all of them after Create). */
  protected readonly touched = signal<ReadonlySet<string>>(new Set());
  protected readonly submitted = signal(false);
  protected readonly confirmLeave = signal(false);

  /** True while the form's record is being read, and while a save is in flight. */
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  /** Messages the server gave for a field (cleared as the field is edited). */
  private readonly serverErrors = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.fields = this.cfg.sections.flatMap((s) => s.fields);
    this.requiredFields = this.fields.filter((f) => f.required);
    this.fieldMap = new Map(this.fields.map((f) => [f.key, f]));
    this.initial = { ...this.cfg.defaults };
    this.values.set({ ...this.initial });

    // The dropdowns (countries, states, currencies ...) and the record to edit come from the API.
    this.store.ensureLoaded();
    const id = String(this.route.snapshot.paramMap.get('id') ?? '');
    this.loading.set(true);
    this.store.whenReady().subscribe(() => {
      if (!id) {
        this.loading.set(false);
        return;
      }
      // Only the record being edited is read - not the whole register.
      this.store.loadDetail(this.cfg.key, id).subscribe({
        next: (full) => {
          this.loading.set(false);
          if (!full) {
            this.leave();
            return;
          }
          if (!this.dirty()) this.open(full);
          else this.editing = full;
        },
        error: () => {
          // A stale link: there is nothing to edit.
          this.loading.set(false);
          this.leave();
        }
      });
    });
  }

  private open(row: MasterRow): void {
    this.editing = row;
    this.preloadStates(row);
    this.initial = this.cfg.toForm(row);
    this.values.set({ ...this.initial });
  }

  /** A state or city being edited needs its country's states for the dropdown. */
  private preloadStates(row: MasterRow): void {
    const country = String(row['country'] ?? '');
    if (country && this.fields.some((f) => f.optionsFrom === 'states')) this.store.loadStates(country);
  }

  protected readonly dirty = computed(() => JSON.stringify(this.values()) !== JSON.stringify(this.initial));

  protected readonly filledRequired = computed(
    () => this.requiredFields.filter((f) => (this.values()[f.key] ?? '').trim() !== '').length
  );
  protected readonly progress = computed(() =>
    this.requiredFields.length ? Math.round((this.filledRequired() / this.requiredFields.length) * 100) : 100
  );

  protected readonly preview = computed<Preview>(() => this.cfg.preview(this.values(), this.store.lookup));

  /** Every rule for every field; shown per field once touched / submitted. */
  protected readonly errors = computed<Record<string, string>>(() => {
    const v = this.values();
    const out: Record<string, string> = {};
    const server = this.serverErrors();
    for (const f of this.fields) {
      const msg = this.check(f, (v[f.key] ?? '').trim(), v) ?? server[f.key];
      if (msg) out[f.key] = msg;
    }
    return out;
  });

  protected readonly errorList = computed<FieldError[]>(() =>
    this.fields.filter((f) => this.errors()[f.key]).map((f) => ({ key: f.key, label: f.label, text: this.errors()[f.key] }))
  );

  // ---- template helpers (by field key) ----
  protected icon(name: IconName): string {
    return MASTER_ICONS[name];
  }

  protected field(key: string): FieldDef {
    const f = this.fieldMap.get(key);
    if (!f) throw new Error(`Unknown field "${key}" in ${this.cfg.key} form`);
    return f;
  }

  protected value(key: string): string {
    return this.values()[key] ?? '';
  }

  /** The field's error once it should show (touched or after Create), else null. */
  protected err(key: string): string | null {
    const e = this.errors()[key];
    return e && (this.submitted() || this.touched().has(key)) ? e : null;
  }

  protected optionsFor(key: string): Option[] {
    const f = this.field(key);
    if (f.options) return f.options;
    if (!f.optionsFrom) return [];
    const parent = f.dependsOn ? this.value(f.dependsOn) : undefined;
    return this.store.options(f.optionsFrom, parent);
  }

  protected isLocked(key: string): boolean {
    return !!(this.field(key).lockOnEdit && this.editing);
  }

  /** A dependent dropdown waiting for its parent (state before country). */
  protected isWaiting(key: string): boolean {
    const f = this.field(key);
    return !!f.dependsOn && !this.value(f.dependsOn);
  }

  protected placeholderFor(key: string): string {
    const f = this.field(key);
    if (this.isWaiting(key)) return f.dependsPlaceholder ?? 'Choose the field above first';
    // display names suggest "<name> (<code>)" while empty
    if (key === 'display' && this.fieldMap.has('code')) {
      const name = this.value('name').trim();
      const code = this.value('code').trim();
      if (name && code) return `${name} (${code})`;
    }
    return f.placeholder ?? '';
  }

  // ---- editing ----
  protected set(key: string, raw: string): void {
    const f = this.field(key);
    const value = f.upper ? raw.toUpperCase() : raw;
    const next = { ...this.values(), [key]: value };
    if (this.serverErrors()[key]) {
      const { [key]: _gone, ...rest } = this.serverErrors();
      this.serverErrors.set(rest);
    }
    // a dependent list (state) is cleared when its parent (country) changes to one that lacks it
    for (const d of this.fields) {
      if (d.dependsOn === key && d.optionsFrom) {
        // the dependent list belongs to the old parent; read the new parent's list
        if (this.values()[key] !== value) next[d.key] = '';
        if (d.optionsFrom === 'states') this.store.loadStates(value);
      }
    }
    this.values.set(next);
  }

  protected onInput(key: string, event: Event): void {
    const el = event.target as HTMLInputElement | HTMLTextAreaElement;
    const caret = el.selectionStart;
    this.set(key, el.value);
    // keep the caret where it was after upper-casing
    if (this.field(key).upper && caret !== null) {
      el.value = this.value(key);
      el.setSelectionRange(caret, caret);
    }
  }

  protected pick(key: string, value: string): void {
    this.set(key, value);
    this.touch(key);
  }

  protected touch(key: string): void {
    if (this.touched().has(key)) return;
    this.touched.set(new Set([...this.touched(), key]));
  }

  /** Arrow keys move through a choice group (radio behaviour). */
  protected onChoiceKey(key: string, event: KeyboardEvent): void {
    const opts = this.field(key).options ?? [];
    const i = opts.findIndex((o) => o.value === this.value(key));
    let n = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') n = (i + 1) % opts.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') n = (i - 1 + opts.length) % opts.length;
    if (n < 0) return;
    event.preventDefault();
    this.pick(key, opts[n].value);
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button')[n]?.focus();
  }

  /** Roving tab stop of a choice group: the chosen option (or the first). */
  protected choiceTab(key: string, value: string, first: boolean): number {
    const v = this.value(key);
    return v === value || (!v && first) ? 0 : -1;
  }

  protected loadExample(): void {
    const ex = { ...this.cfg.defaults, ...this.example };
    // keep a locked code when editing
    if (this.editing) for (const f of this.fields) if (f.lockOnEdit) ex[f.key] = this.initial[f.key];
    this.values.set(ex);
    this.touched.set(new Set());
    this.submitted.set(false);
  }

  protected reset(): void {
    this.values.set({ ...this.initial });
    this.touched.set(new Set());
    this.submitted.set(false);
  }

  /** Section shortcut buttons scroll to the section with this id. */
  protected jump(id: string): void {
    this.host.nativeElement.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected focusField(key: string): void {
    const root = this.host.nativeElement;
    const el =
      root.querySelector<HTMLElement>(`[data-field="${key}"] :is(input, textarea, .ms-trigger, button[aria-checked="true"])`) ??
      root.querySelector<HTMLElement>(`[data-field="${key}"] button`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }

  protected save(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    if (this.errorList().length) {
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.mf-errors')?.focus());
      return;
    }
    const editing = this.editing;
    const row = this.cfg.toRow(this.values(), editing?.id ?? '');
    this.saving.set(true);
    this.store.save(this.cfg.key, row, editing).subscribe({
      next: (saved) => {
        this.saving.set(false);
        const name = String(saved[this.cfg.nameKey] ?? '');
        this.store.notice.set({
          key: this.cfg.key,
          text: editing ? `${name} was saved.` : `${name} was added to ${this.cfg.plural.toLowerCase()}.`,
          tone: 'ok'
        });
        this.leave();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const { message, fields } = this.store.describeError(this.cfg.key, error);
        // Field messages from the server show beside their fields; anything else goes on the
        // name field so it appears in the error summary.
        this.serverErrors.set(Object.keys(fields).length ? fields : { [this.cfg.nameKey]: message });
        setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.mf-errors')?.focus());
      }
    });
  }

  protected cancel(): void {
    if (this.dirty()) this.confirmLeave.set(true);
    else this.leave();
  }

  protected leave(): void {
    this.confirmLeave.set(false);
    this.router.navigate([this.cfg.route]);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.confirmLeave()) this.confirmLeave.set(false);
  }

  // ---- rules ----
  private check(f: FieldDef, v: string, all: FormValues): string | null {
    if (!v) return f.required ? `${f.kind === 'select' || f.kind === 'choice' ? 'Choose' : 'Enter'} ${this.article(f.label)}.` : null;
    if (f.kind === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) return 'Enter a number.';
      if (f.integer && !Number.isInteger(n)) return 'Enter a whole number.';
      if (f.min !== undefined && n < f.min) return `Use ${f.min} or more.`;
      if (f.max !== undefined && n > f.max) return `Use ${f.max} or less.`;
    }
    if (f.pattern && !f.pattern.test(v)) return f.patternMsg ?? 'Check the format.';
    if (f.regex) {
      try {
        new RegExp(v);
      } catch {
        return 'This is not a valid regular expression.';
      }
    }
    if (f.mustInclude && !v.includes(f.mustInclude)) return `Include ${f.mustInclude} where the number goes.`;
    if (f.key === this.cfg.codeKey && !(f.lockOnEdit && this.editing)) {
      const scope = this.cfg.key === 'state' || this.cfg.key === 'city' ? { field: 'country', value: all['country'] ?? '' } : undefined;
      if (this.store.isDuplicate(this.cfg.key, f.key, v, this.editing?.id ?? null, scope)) {
        return `Another ${this.cfg.singular} already uses ${v}${scope && scope.value ? ' in this country' : ''}.`;
      }
    }
    return null;
  }

  private article(label: string): string {
    const l = label.toLowerCase();
    return /^[aeiou]/.test(l) ? `an ${l}` : `a ${l}`;
  }
}
