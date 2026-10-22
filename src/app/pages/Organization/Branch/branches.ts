import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OrgStore, Office, ICONS, focusDialog, ADD_OFFICE_PATH } from '../../../Shared/Organization/org.store';

@Component({
  selector: 'app-org-branches',
  imports: [],
  templateUrl: './branches.html',
  styleUrls: ['./branches.css']
})
export class OrgBranches {
  private readonly router = inject(Router);
  protected readonly store = inject(OrgStore);

  protected readonly rows = this.store.sortedOffices;

  protected readonly stats = computed(() => {
    const list = this.store.offices();
    const total = list.length;
    const active = list.filter((o) => o.active).length;
    const people = list.reduce((n, o) => n + this.store.officePeople(o.id), 0);
    return {
      total,
      topLevel: list.filter((o) => !o.parentId).length,
      active,
      inactive: total - active,
      activePct: total ? Math.round((active / total) * 100) : 0,
      people,
      avg: total ? (people / total).toFixed(1) : '0',
      noManager: list.filter((o) => !o.managerId).length
    };
  });

  protected readonly viewing = signal<Office | null>(null);
  protected readonly deleting = signal<Office | null>(null);

  protected icon(name: string): string { return ICONS[name] ?? ''; }

  protected initialsOf(name: string): string {
    return (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  protected canDelete(o: Office): boolean {
    return this.store.officePeople(o.id) === 0 && this.store.officeChildren(o.id) === 0;
  }

  protected parentName(o: Office): string {
    return this.store.offices().find((x) => x.id === o.parentId)?.name ?? 'Top level';
  }

  protected fullAddress(o: Office): string {
    return [o.address1, o.address2, o.city, o.state, o.postal, o.country].filter(Boolean).join(', ');
  }

  protected exportCsv(): void {
    const header = ['Name', 'Code', 'Sits under', 'Manager', 'People', 'Status'];
    const lines = this.rows().map((o) => [
      o.name,
      o.code,
      this.parentName(o),
      this.store.person(o.managerId)?.name ?? 'Not assigned',
      this.store.officePeople(o.id),
      o.active ? 'Active' : 'Inactive'
    ]);
    const csv = [header, ...lines]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'branches.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected openView(o: Office): void { this.viewing.set(o); focusDialog(); }
  protected closeView(): void { this.viewing.set(null); }

  protected create(): void { this.router.navigate([ADD_OFFICE_PATH]); }
  protected edit(o: Office): void { this.closeView(); this.router.navigate([ADD_OFFICE_PATH], { queryParams: { id: o.id } }); }

  protected askDelete(o: Office): void { if (this.canDelete(o)) { this.deleting.set(o); focusDialog(); } }
  protected cancelDelete(): void { this.deleting.set(null); }
  protected confirmDelete(): void {
    const o = this.deleting();
    if (o) this.store.removeOffice(o.id);
    this.deleting.set(null);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.deleting()) this.cancelDelete();
    else if (this.viewing()) this.closeView();
  }
}