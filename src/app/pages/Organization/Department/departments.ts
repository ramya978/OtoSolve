import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { initialsOf } from '../../../Shared/IAM/iam-data';
import { OrgStore, Department, ICONS, focusDialog } from '../../../Shared/Organization/org.store';
import { ToastService } from '../../../Shared/services/toast.service';
import { apiErrorMessage } from '../../../Shared/models/api-response.model';

@Component({
  selector: 'app-org-departments',
  imports: [],
  templateUrl: './departments.html',
  styleUrls: ['./departments.css']
})
export class OrgDepartments implements OnInit {
  protected readonly store = inject(OrgStore);
  private readonly toast = inject(ToastService);
  protected readonly saving = signal(false);

  ngOnInit(): void {
    this.store.loadStructure().subscribe({
      error: (e: unknown) => this.toast.error('Departments not loaded', apiErrorMessage(e, 'The departments could not be loaded.'))
    });
  }

  protected readonly rows = this.store.sortedDepartments;

  protected readonly stats = computed(() => {
    const list = this.store.departments();
    const total = list.length;
    const active = list.filter((d) => d.active).length;
    const people = list.reduce((n, d) => n + this.store.deptPeople(d.id), 0);
    return {
      total,
      active,
      inactive: total - active,
      activePct: total ? Math.round((active / total) * 100) : 0,
      topLevel: list.filter((d) => !d.parentId).length,
      people,
      avg: total ? (people / total).toFixed(1) : '0',
      noHead: list.filter((d) => !d.headId).length
    };
  });

  /* popups */
  protected readonly viewing = signal<Department | null>(null);
  protected readonly formMode = signal<'create' | 'edit' | null>(null);
  protected readonly deleting = signal<Department | null>(null);

  /* form */
  protected readonly quickPicks = ['Fundraising', 'Finance', 'Programmes', 'Operations', 'Communications', 'Volunteers'];
  private editingId: string | null = null;
  protected readonly fCode = signal('');
  protected readonly fOrder = signal(10);
  protected readonly fName = signal('');
  protected readonly fParent = signal('');
  protected readonly fHead = signal('');
  protected readonly fDesc = signal('');
  protected readonly fActive = signal(true);
  protected readonly submitted = signal(false);

  protected readonly parentOptions = computed(() => this.store.sortedDepartments().filter((d) => d.id !== this.editingId));

  protected readonly errors = computed(() => {
    const code = this.fCode().trim().toUpperCase();
    const name = this.fName().trim();
    const clash = this.store.departments().some((d) => d.code.toUpperCase() === code && d.id !== this.editingId);
    return {
      code: !code ? 'Add a short code' : clash ? 'This code is already used' : '',
      name: !name ? 'Add a department name' : ''
    };
  });

  protected icon(name: string): string { return ICONS[name] ?? ''; }
  protected initialsOf = initialsOf;

  protected canDelete(d: Department): boolean {
    return this.store.deptPeople(d.id) === 0 && this.store.deptChildren(d.id) === 0;
  }

  protected childrenOf(d: Department): Department[] {
    return this.store.departments().filter((x) => x.parentId === d.id);
  }

  protected peopleShare(d: Department): number {
    const total = this.stats().people;
    return total ? Math.round((this.store.deptPeople(d.id) / total) * 100) : 0;
  }

  protected parentName(d: Department): string {
    return this.store.departments().find((x) => x.id === d.parentId)?.name ?? 'Top level';
  }

  /* ---------- export ---------- */
  protected exportCsv(): void {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['Code', 'Name', 'Sits under', 'Head', 'People', 'Status', 'Display order', 'Description'];
    const lines = this.rows().map((d) => [
      d.code,
      d.name,
      this.parentName(d),
      this.store.person(d.headId)?.name ?? '',
      this.store.deptPeople(d.id),
      d.active ? 'Active' : 'Inactive',
      d.order,
      d.description
    ].map(esc).join(','));
    const blob = new Blob([[header.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'departments.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- view ---------- */
  protected openView(d: Department): void { this.viewing.set(d); focusDialog(); }
  protected closeView(): void { this.viewing.set(null); }

  protected editFromView(): void {
    const d = this.viewing();
    this.closeView();
    if (d) this.openEdit(d);
  }

  /* ---------- create / edit ---------- */
  protected openCreate(): void {
    this.editingId = null;
    this.fCode.set('');
    this.fOrder.set(this.store.nextDeptOrder());
    this.fName.set('');
    this.fParent.set('');
    this.fHead.set('');
    this.fDesc.set('');
    this.fActive.set(true);
    this.submitted.set(false);
    this.formMode.set('create');
    focusDialog();
  }

  protected openEdit(d: Department): void {
    this.editingId = d.id;
    this.fCode.set(d.code);
    this.fOrder.set(d.order);
    this.fName.set(d.name);
    this.fParent.set(d.parentId ?? '');
    this.fHead.set(d.headId ?? '');
    this.fDesc.set(d.description);
    this.fActive.set(d.active);
    this.submitted.set(false);
    this.formMode.set('edit');
    focusDialog();
  }

  protected closeForm(): void { this.formMode.set(null); }

  protected setOrder(raw: string): void {
    const n = Number(raw);
    this.fOrder.set(Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  }

  protected save(): void {
    this.submitted.set(true);
    const e = this.errors();
    if (e.code || e.name) return;
    if (this.saving()) return;
    const existing = this.editingId ? this.store.departments().find((x) => x.id === this.editingId) : undefined;
    const creating = !existing;
    this.saving.set(true);
    this.store.saveDepartment({
      id: this.editingId ?? '',
      version: existing?.version,
      code: this.fCode().trim().toUpperCase(),
      name: this.fName().trim(),
      description: this.fDesc().trim(),
      parentId: this.fParent() || null,
      headId: this.fHead() || null,
      order: this.fOrder(),
      active: this.fActive()
    }, creating).subscribe({
      next: (row) => {
        this.saving.set(false);
        this.closeForm();
        this.toast.success(creating ? 'Department added' : 'Department saved', row.name);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error('Department not saved', apiErrorMessage(e, 'The department could not be saved.'));
      }
    });
  }

  /* ---------- delete ---------- */
  protected askDelete(d: Department): void { if (this.canDelete(d)) { this.deleting.set(d); focusDialog(); } }
  protected cancelDelete(): void { this.deleting.set(null); }
  protected confirmDelete(): void {
    const d = this.deleting();
    this.deleting.set(null);
    if (!d) return;
    this.store.removeDepartment(d).subscribe({
      next: () => this.toast.success('Department removed', d.name),
      error: (e: unknown) => this.toast.error('Department not removed', apiErrorMessage(e, 'The department could not be removed.'))
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.deleting()) this.cancelDelete();
    else if (this.formMode()) this.closeForm();
    else if (this.viewing()) this.closeView();
  }
}