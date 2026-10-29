import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UserDirectoryApiService } from '../../Service/user-directory-api.service';
import { IamAdminApiService } from '../../Service/iam-admin-api.service';
import { PageHeader } from '../../Shared/layout/page-header/page-header';

export interface Policy {
  id: string; name: string; code: string; description: string; category: string;
  maxSessions: number; requiresCheckout: boolean; creditBusinessDuty: boolean;
  effectiveDate: string; version: number; active: boolean; graceMinutes: number;
  minHours: number; weeklyOff: string; createdBy: string;
}
interface Person { id: string; name: string; department: string; designation: string; initials: string; }
interface PolicyAssignment { id: string; employeeId: string; policyId: string; effectiveDate: string; source: 'demo' | 'local'; }
type Filter = 'all' | 'active' | 'disabled';
type Tab = 'library' | 'assignments';
const STORE = 'precision-attendance-policies-v2';
const DEFAULT_RULES: Policy[] = [
  ['Standard attendance','STD','Default daily attendance with standard punch compliance.','Core',2,true,true,'2026-01-01',1,true,10,8,'Sunday'],
  ['Flexible working','FLX','Flexible arrival with a defined daily working-hours target.','Flexible',4,true,true,'2026-01-01',2,true,30,8,'Sunday'],
  ['Remote work','RMT','Remote check-in, check-out and approved business-duty credit.','Remote',4,true,true,'2026-02-01',1,true,15,8,'Sunday'],
  ['Field operations','FLD','Multiple field visits and approved offsite work sessions.','Operations',8,true,true,'2026-02-15',3,true,20,7,'Rotational'],
  ['General office','OFC','Fixed office attendance with a short grace period.','Core',2,true,false,'2026-01-15',2,true,10,8,'Sunday'],
  ['Night operations','NGT','Overnight schedules and next-day check-out.','Operations',3,true,true,'2026-03-01',2,true,15,8,'Rotational'],
  ['Customer support','SUP','Split sessions for customer support teams.','Operations',6,true,true,'2026-04-01',1,true,15,8,'Rotational'],
  ['Part-time staff','PRT','Reduced workday target with flexible attendance.','Flexible',2,true,false,'2026-01-01',1,true,10,4,'Sunday'],
  ['Internship program','INT','Training attendance and supervised time account.','Special',2,true,false,'2026-05-01',1,true,5,6,'Sunday'],
  ['Weekend coverage','WKC','Weekly-off replacement for weekend coverage teams.','Operations',4,true,true,'2026-03-15',1,true,20,8,'Rotational'],
  ['Temporary contractors','TMP','Temporary worker attendance with controlled access.','Special',2,true,false,'2026-03-01',1,false,0,8,'Sunday'],
  ['Legacy flexible policy','LGC','Previous flexible attendance policy retained for history.','Flexible',6,false,true,'2025-07-01',4,false,45,7,'Saturday'],
  ['On-call response','ONC','Callout sessions and business duty across variable hours.','Special',8,true,true,'2026-06-01',1,true,20,6,'Rotational'],
  ['Manufacturing day shift','MFG','Regular production shift with strict time tracking.','Operations',2,true,false,'2026-04-01',1,true,5,8,'Sunday'],
  ['Executive flexibility','EXE','Flexible daily schedule with approved travel allowances.','Flexible',6,true,true,'2026-05-01',2,true,45,7,'Saturday'],
  ['Archived pilot','PIL','Discontinued attendance pilot retained for audit.','Special',4,false,false,'2025-10-01',2,false,30,8,'Sunday']
].map(([name, code, description, category, maxSessions, requiresCheckout, creditBusinessDuty, effectiveDate, version, active, graceMinutes, minHours, weeklyOff], i) => ({
  id: 'POL-DEMO-' + String(i + 1).padStart(2,'0'),
  name: String(name), code: String(code), description: String(description), category: String(category),
  maxSessions: Number(maxSessions), requiresCheckout: Boolean(requiresCheckout), creditBusinessDuty: Boolean(creditBusinessDuty),
  effectiveDate: String(effectiveDate), version: Number(version), active: Boolean(active), graceMinutes: Number(graceMinutes),
  minHours: Number(minHours), weeklyOff: String(weeklyOff), createdBy: 'Demo policy'
}));

const listOf = (value: any): any[] => {
  const roots = [value, value?.data, value?.result, value?.response, value?.data?.data];
  for (const root of roots) {
    if (Array.isArray(root)) return root;
    for (const key of ['content','items','users','results','departments','records','data']) {
      if (Array.isArray(root?.[key])) return root[key];
    }
  }
  return [];
};
const uid = () => 'POL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7);
const today = () => new Date().toISOString().slice(0,10);
const initials = (s: string) => s.trim().split(/\s+/).slice(0,2).map(x => x[0] ?? '').join('').toUpperCase();
const dateText = (s: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';

@Component({
  selector: 'app-attendance-policies', standalone: true,
  imports: [CommonModule, FormsModule, PageHeader],
  templateUrl: './attendance-policies.html', styleUrls: ['./attendance-policies.css']
})
export class AttendancePoliciesComponent implements OnInit {
  private readonly userApi = inject(UserDirectoryApiService);
  private readonly deptApi = inject(IamAdminApiService);
  readonly people = signal<Person[]>([]);
  readonly departments = signal<string[]>([]);
  readonly policies = signal<Policy[]>(DEFAULT_RULES.map(p => ({...p})));
  readonly policyAssignments = signal<PolicyAssignment[]>([]);
  readonly loading = signal(false);
  readonly apiError = signal('');
  readonly toast = signal('');
  readonly tab = signal<Tab>('library');
  readonly policyFilter = signal<Filter>('all');
  readonly search = signal('');
  readonly category = signal('all');
  readonly dept = signal('all');
  readonly employeeSearch = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly selectedId = signal('');
  readonly editingId = signal('');
  readonly dialog = signal<'policy' | 'assign' | ''>('');
  readonly categories = ['Core','Flexible','Remote','Operations','Special'];
  readonly pageSizes = [10,20,50];
  policyForm: Policy = this.emptyPolicy();
  assignEmployee = '';
  assignPolicy = '';
  assignDate = today();
  readonly total = computed(() => this.policies().length);
  readonly activeCount = computed(() => this.policies().filter(p => p.active).length);
  readonly disabledCount = computed(() => this.policies().filter(p => !p.active).length);
  readonly assignedCount = computed(() => this.people().filter(p => this.assignmentFor(p.id)).length);
  readonly filteredPolicies = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.policies().filter(p => (this.policyFilter() === 'all' || (this.policyFilter() === 'active' ? p.active : !p.active))
      && (this.category() === 'all' || p.category === this.category())
      && (!q || [p.name,p.code,p.description,p.category].join(' ').toLowerCase().includes(q)));
  });
  readonly filteredPeople = computed(() => {
    const q = this.employeeSearch().trim().toLowerCase();
    return this.people().filter(p => (this.dept() === 'all' || p.department === this.dept()) &&
      (!q || [p.name,p.id,p.department,p.designation].join(' ').toLowerCase().includes(q)));
  });
  readonly rowCount = computed(() => this.tab() === 'library' ? this.filteredPolicies().length : this.filteredPeople().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.rowCount() / this.pageSize())));
  readonly pagedPolicies = computed(() => this.filteredPolicies().slice((this.page() - 1)*this.pageSize(), this.page()*this.pageSize()));
  readonly pagedPeople = computed(() => this.filteredPeople().slice((this.page() - 1)*this.pageSize(), this.page()*this.pageSize()));
  readonly showingStart = computed(() => this.rowCount() ? (this.page() - 1) * this.pageSize() + 1 : 0);
  readonly showingEnd = computed(() => Math.min(this.rowCount(), this.page() * this.pageSize()));
  readonly pageNumbers = computed(() => Array.from({length: this.pageCount()},(_,i) => i+1).filter(p => this.pageCount()<=7 || Math.abs(p-this.page())<=2 || p===1 || p===this.pageCount()));
  readonly selectedPolicy = computed(() => this.policies().find(p => p.id === this.selectedId()) ?? this.filteredPolicies()[0] ?? null);
  readonly fmtDate = dateText;

  ngOnInit(): void { this.restore(); void this.loadPeople(); }

  private restore(): void {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.policies)) {
        const ids = new Set<string>(saved.policies.map((p:Policy) => p.id));
        this.policies.set([...saved.policies, ...DEFAULT_RULES.filter(p => !ids.has(p.id))]);
      }
      if (Array.isArray(saved.assignments)) this.policyAssignments.set(saved.assignments);
    } catch { this.toast.set('Browser storage could not be read.'); }
  }
  private persist(): void {
    try {
      localStorage.setItem(STORE, JSON.stringify({policies:this.policies(), assignments:this.policyAssignments()}));
      this.toast.set('Changes saved in this browser');
    } catch { this.toast.set('Unable to save changes in browser storage'); }
  }
  async loadPeople(): Promise<void> {
    this.loading.set(true); this.apiError.set('');
    try {
      const [usersRes, depsRes] = await Promise.allSettled([
        firstValueFrom(this.userApi.searchUsers({pageIndex:0,pageSize:1000})),
        firstValueFrom(this.deptApi.getDepartments())
      ]);
      if (usersRes.status === 'rejected') throw usersRes.reason;
      const departments = depsRes.status === 'fulfilled' ? listOf(depsRes.value) : [];
      const byId = new Map<string,string>();
      const deptNames: string[] = [];
      departments.forEach((d:any) => {
        const name = String(d?.name ?? d?.departmentName ?? d?.title ?? '').trim();
        const id = d?.id ?? d?.departmentId ?? d?.uuid;
        if (name) deptNames.push(name);
        if (name && id != null) byId.set(String(id),name);
      });
      const mapped: Person[] = listOf(usersRes.value).map((u:any) => {
        const id = String(u?.id ?? u?.userId ?? u?.user_id ?? u?.employeeId ?? u?.uuid ?? '');
        const name = String(u?.name ?? u?.fullName ?? u?.full_name ?? [u?.firstName,u?.lastName].filter(Boolean).join(' ') ?? u?.username ?? '').trim() || String(u?.email ?? id);
        const d = u?.department ?? u?.departmentDetails ?? u?.departmentName ?? u?.department_id ?? u?.departmentId;
        const depId = u?.departmentId ?? u?.department_id ?? (typeof d === 'object' ? d?.id ?? d?.uuid : d);
        const department = typeof d === 'object' ? String(d?.name ?? d?.departmentName ?? byId.get(String(depId)) ?? 'Unassigned') : byId.get(String(depId)) ?? String(d ?? 'Unassigned');
        const designation = u?.designation?.name ?? u?.jobTitle ?? u?.job_title ?? u?.role?.name ?? (typeof u?.designation === 'string' ? u.designation : 'Employee');
        return {id,name,department,designation:String(designation),initials:initials(name)};
      }).filter((p:Person) => !!p.id);
      const unique = Array.from(new Map(mapped.map(p => [p.id,p])).values());
      this.people.set(unique);
      this.departments.set([...new Set([...deptNames,...unique.map(p => p.department)])].filter(Boolean).sort());
      this.seedAssignments(unique);
      if (depsRes.status === 'rejected') this.toast.set('Employees loaded; department list unavailable.');
    } catch (err) {
      this.apiError.set('Could not load employees. Check API access and authentication.');
      this.people.set([]);
    } finally { this.loading.set(false); }
  }
  private seedAssignments(people: Person[]): void {
    // Employee identity always comes from the Users API. All generated assignments are clearly demo records.
    const rules = this.policies().filter(p => p.active);
    if (!rules.length) return;
    const existing = new Set(this.policyAssignments().filter(a => a.source === 'local').map(a => a.employeeId));
    const previouslySaved = this.policyAssignments().filter(a => a.source === 'local');
    const demo: PolicyAssignment[] = [];
    people.forEach((employee, i) => {
      if (existing.has(employee.id)) return;
      // Two historical demo assignments per API employee; most recent controls the current policy.
      const current = rules[(i * 7 + 3) % rules.length];
      const old = rules[(i * 3 + 1) % rules.length];
      demo.push({id:'DEMO-A-'+employee.id,employeeId:employee.id,policyId:current.id,effectiveDate:'2026-06-01',source:'demo'});
      demo.push({id:'DEMO-H-'+employee.id,employeeId:employee.id,policyId:old.id,effectiveDate:'2026-01-01',source:'demo'});
    });
    this.policyAssignments.set([...previouslySaved,...demo]);
  }
  assignmentFor(id:string): PolicyAssignment | undefined {
    return this.policyAssignments().filter(a => a.employeeId === id && a.effectiveDate <= today())
      .sort((a,b) => b.effectiveDate.localeCompare(a.effectiveDate) || (a.source === 'local' ? -1 : 1))[0];
  }
  policyFor(id:string): Policy | undefined { return this.policies().find(p => p.id === this.assignmentFor(id)?.policyId); }
  assignedTo(id:string): number { return this.people().filter(e => this.policyFor(e.id)?.id === id).length; }
  setTab(value:Tab): void { this.tab.set(value); this.page.set(1); }
  setFilter(value:Filter): void { this.policyFilter.set(value); this.page.set(1); }
  setSearch(value:string): void { this.search.set(value); this.page.set(1); }
  setCategory(value:string): void { this.category.set(value); this.page.set(1); }
  setDepartment(value:string): void { this.dept.set(value); this.page.set(1); }
  setEmployeeSearch(value:string): void { this.employeeSearch.set(value); this.page.set(1); }
  setPageSize(value:number): void { this.pageSize.set(value); this.page.set(1); }
  changePage(value:number): void { if (value>=1 && value<=this.pageCount()) this.page.set(value); }
  private emptyPolicy():Policy { return {id:'',name:'',code:'',description:'',category:'Core',maxSessions:2,requiresCheckout:true,creditBusinessDuty:true,effectiveDate:today(),version:1,active:true,graceMinutes:10,minHours:8,weeklyOff:'Sunday',createdBy:'Local'}; }
  openPolicy(value?:Policy):void { this.editingId.set(value?.id ?? ''); this.policyForm = value ? {...value} : this.emptyPolicy(); this.dialog.set('policy'); }
  savePolicy():void {
    const f = this.policyForm;
    if (!f.name.trim() || !f.code.trim() || !f.effectiveDate || !f.description.trim() ||
      !Number.isInteger(+f.maxSessions) || +f.maxSessions<1 || +f.maxSessions>8 ||
      !Number.isFinite(+f.minHours) || +f.minHours<0 || +f.minHours>24 ||
      !Number.isFinite(+f.graceMinutes) || +f.graceMinutes<0 || +f.graceMinutes>180) {
      this.toast.set('Enter a name, code, description and valid numeric rules.'); return;
    }
    const updated: Policy = {...f, name:f.name.trim(),code:f.code.trim().toUpperCase(), maxSessions:+f.maxSessions,minHours:+f.minHours,graceMinutes:+f.graceMinutes,
      id:this.editingId() || uid(), version:this.editingId() ? f.version + 1 : 1,createdBy:'Local'};
    this.policies.update(rows => this.editingId() ? rows.map(p => p.id===this.editingId() ? updated : p) : [updated,...rows]);
    this.selectedId.set(updated.id); this.dialog.set(''); this.persist();
  }
  togglePolicy(p:Policy):void {
    this.policies.update(rows => rows.map(x => x.id===p.id ? {...x,active:!x.active} : x)); this.persist();
  }
  openAssign(employeeId?:string):void {
    this.assignEmployee=employeeId ?? this.people()[0]?.id ?? '';
    this.assignPolicy=this.policies().find(p => p.active)?.id ?? '';
    this.assignDate=today();this.dialog.set('assign');
  }
  saveAssignment():void {
    if (!this.assignEmployee || !this.assignPolicy || !this.assignDate || !this.policies().find(p => p.id===this.assignPolicy && p.active)) {
      this.toast.set('Choose an employee, an active policy and a valid date.'); return;
    }
    const row:PolicyAssignment = {id:uid(),employeeId:this.assignEmployee,policyId:this.assignPolicy,effectiveDate:this.assignDate,source:'local'};
    this.policyAssignments.update(rows => [...rows,row]); this.dialog.set(''); this.persist();
  }
  close():void { this.dialog.set(''); }
}
