import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { IamAdminApiService } from '../../Service/iam-admin-api.service';
import { UserDirectoryApiService } from '../../Service/user-directory-api.service';
import { LoaderService } from '../../Shared/services/loader.service';
import { PageHeader } from '../../Shared/layout/page-header/page-header';

export type Panel = 'planner' | 'templates' | 'permissions' | 'policies';
type RequestState = 'pending'|'approved'|'declined'|'cancelled';
interface Person { id:string; name:string; department:string; }
interface Shift { id:string; name:string; start:string; end:string; breakMinutes:number; graceMinutes:number; color:string; active:boolean; version:number; }
interface Assignment { id:string; employeeId:string; date:string; shiftId:string; shiftName:string; start:string; end:string; breakMinutes:number; version:number; }
interface Permission { id:string; employeeId:string; date:string; start:string; end:string; reason:string; type:string; status:RequestState; note:string; }
interface Policy { id:string; name:string; description:string; maxSessions:number; requiresCheckout:boolean; creditBusinessDuty:boolean; effectiveDate:string; version:number; active:boolean; }
interface PolicyAssignment { employeeId:string; policyId:string; effectiveDate:string; }
const STORE = 'precision-attendance-management-v1';
const iso = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dayAdd = (date:string, n:number) => { const d=new Date(date+'T12:00:00'); d.setDate(d.getDate()+n); return iso(d); };
const key = () => 'REC-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
const arrayOf = (x:any):any[] => Array.isArray(x)?x:Array.isArray(x?.data)?x.data:Array.isArray(x?.data?.items)?x.data.items:Array.isArray(x?.data?.content)?x.data.content:Array.isArray(x?.items)?x.items:Array.isArray(x?.content)?x.content:Array.isArray(x?.results)?x.results:[];
const defaults:Shift[] = [
  {id:'SH-EARLY',name:'Early shift',start:'06:00',end:'14:00',breakMinutes:30,graceMinutes:10,color:'teal',active:true,version:1},
  {id:'SH-GENERAL',name:'General shift',start:'09:00',end:'18:00',breakMinutes:60,graceMinutes:10,color:'blue',active:true,version:1},
  {id:'SH-EVENING',name:'Evening shift',start:'14:00',end:'22:00',breakMinutes:30,graceMinutes:10,color:'amber',active:true,version:1},
  {id:'SH-NIGHT',name:'Night shift',start:'22:00',end:'06:00',breakMinutes:30,graceMinutes:10,color:'violet',active:true,version:1},
];
const basePolicies:Policy[] = [
  {id:'POL-STD',name:'Standard attendance',description:'One work session with required check-out.',maxSessions:1,requiresCheckout:true,creditBusinessDuty:true,effectiveDate:'2026-01-01',version:1,active:true},
  {id:'POL-FLEX',name:'Flexible duty',description:'Multiple sessions and approved business-duty credit.',maxSessions:8,requiresCheckout:true,creditBusinessDuty:true,effectiveDate:'2026-01-01',version:1,active:true},
];
@Component({ selector:'app-shift-templates', standalone:true, imports:[CommonModule,FormsModule,PageHeader], templateUrl:'./shift-templates.html', styleUrl:'./shift-templates.css' })
export class ShiftTemplatesComponent implements OnInit {
  readonly panels:{id:Panel;label:string;caption:string}[]=[
    {id:'planner',label:'Shift planner',caption:'Weekly roster and assignments'},
    {id:'templates',label:'Shift templates',caption:'Work windows and rules'},
    {id:'permissions',label:'Permission desk',caption:'Time-away decisions'},
    {id:'policies',label:'Attendance policies',caption:'Employee attendance rules'}
  ];
  view=signal<Panel>('templates'); people=signal<Person[]>([]); departments=signal<string[]>([]);
  shifts=signal<Shift[]>([...defaults]); assignments=signal<Assignment[]>([]);
  permissions=signal<Permission[]>([]); policies=signal<Policy[]>([...basePolicies]); policyAssignments=signal<PolicyAssignment[]>([]);
  loading=signal(false); apiError=signal(''); toast=signal('');
  dept='all'; search=''; week=iso(new Date()); showArchived=true; permissionFilter='all';
  dialog:''|'shift'|'assign'|'permission'|'policy'|'policyAssign'=''; editingId='';
  shiftForm:Shift=this.emptyShift(); assignForm={shiftId:'SH-GENERAL',from:iso(new Date()),to:iso(new Date()),employeeIds:[] as string[],weekends:false,replace:false};
  permissionForm:Permission=this.emptyPermission(); policyForm:Policy=this.emptyPolicy(); policyEmployee=''; policyId='POL-STD'; policyEffective=iso(new Date());
  readonly weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  days(){const d=new Date(this.week+'T12:00:00'),i=(d.getDay()+6)%7;const start=dayAdd(this.week,-i);return Array.from({length:7},(_,j)=>dayAdd(start,j));}
  filteredPeople(){return this.people().filter(e=>(this.dept==='all'||e.department===this.dept)&&(`${e.name} ${e.id} ${e.department}`).toLowerCase().includes(this.search.toLowerCase()));}
  filteredPermissions(){return this.permissions().filter(p=>this.permissionFilter==='all'||p.status===this.permissionFilter);}
  activeShifts(){return this.shifts().filter(s=>s.active);}
  private readonly userApi = inject(UserDirectoryApiService);
  private readonly deptApi = inject(IamAdminApiService);
  private readonly loaderService = inject(LoaderService);
  ngOnInit(){this.restore();this.loadPeople();}
  private restore(){try{const raw=localStorage.getItem(STORE);if(!raw)return;const s=JSON.parse(raw);if(Array.isArray(s.shifts))this.shifts.set(s.shifts);if(Array.isArray(s.assignments))this.assignments.set(s.assignments);if(Array.isArray(s.permissions))this.permissions.set(s.permissions);if(Array.isArray(s.policies))this.policies.set(s.policies);if(Array.isArray(s.policyAssignments))this.policyAssignments.set(s.policyAssignments);}catch{}}
  private persist(){try{localStorage.setItem(STORE,JSON.stringify({shifts:this.shifts(),assignments:this.assignments(),permissions:this.permissions(),policies:this.policies(),policyAssignments:this.policyAssignments()}));this.notice('Changes saved locally');}catch{this.notice('Could not save to browser storage');}}
  notice(message:string){this.toast.set(message);}
  async loadPeople(){
    this.loaderService.startLoading();
    this.loading.set(true); this.apiError.set('');
    try {
      const [userResponse, deptResponse] = await Promise.all([
        firstValueFrom(this.userApi.searchUsers({ pageIndex: 0, pageSize: 1000 })),
        firstValueFrom(this.deptApi.getDepartments()),
      ]);
      this.departments.set(deptResponse.map((d:any)=>String(d.name??d.departmentName??d.title??'')).filter(Boolean));
      const userRows = arrayOf(userResponse);
      this.people.set(userRows.map((u:any)=>{
        const name=String(u.name??u.fullName??([u.firstName,u.lastName].filter(Boolean).join(' ')||u.username||'Employee'));
        const dep=u.department??u.departmentDetails??u.departmentName;
        return {id:String(u.id??u.userId??u.employeeId??''),name,department:typeof dep==='object'?String(dep?.name??dep?.departmentName??'Unassigned'):String(dep??'Unassigned')};
      }).filter((p:Person)=>p.id));
      this.loaderService.dataReceived();
    } catch(err) {
      this.apiError.set((err instanceof Error ? err.message : String(err)) + '. Check authentication, CORS and server.');
    } finally {
      this.loading.set(false);
    }
  }
  changeWeek(n:number){this.week=dayAdd(this.week,n*7);}
  shiftFor(e:string,date:string){return this.assignments().find(a=>a.employeeId===e&&a.date===date);}
  shiftName(id:string){return this.shifts().find(s=>s.id===id)?.name??'Unknown';}
  personName(id:string){return this.people().find(e=>e.id===id)?.name??id;}
  durationText(start:string,end:string){const a=Number(start.slice(0,2))*60+Number(start.slice(3)),b=Number(end.slice(0,2))*60+Number(end.slice(3));const m=(b-a+1440)%1440;return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`;}
  permissionCount(s:RequestState){return this.permissions().filter(p=>p.status===s).length;}
  policyFor(e:string){const ass=this.policyAssignments().filter(a=>a.employeeId===e&&a.effectiveDate<=iso(new Date())).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0];return this.policies().find(p=>p.id===ass?.policyId)?.name??'Not assigned';}
  private emptyShift():Shift{return {id:'',name:'',start:'09:00',end:'18:00',breakMinutes:60,graceMinutes:10,color:'blue',active:true,version:1};}
  private emptyPermission():Permission{return {id:'',employeeId:'',date:iso(new Date()),start:'09:00',end:'10:00',reason:'',type:'Personal permission',status:'pending',note:''};}
  private emptyPolicy():Policy{return {id:'',name:'',description:'',maxSessions:1,requiresCheckout:true,creditBusinessDuty:false,effectiveDate:iso(new Date()),version:1,active:true};}
  templateSearch = '';
  templateFilter: 'all'|'active'|'archived' = 'all';
  get visibleShifts(): Shift[] {
    const q = this.templateSearch.trim().toLowerCase();
    return this.shifts().filter(s => (this.templateFilter === 'all' || (this.templateFilter === 'active' ? s.active : !s.active)) &&
      (this.showArchived || s.active || this.templateFilter === 'archived') &&
      (!q || [s.name,s.start,s.end,s.id].some(v=>v.toLowerCase().includes(q))));
  }
  shiftUsage(id:string):number { return this.assignments().filter(a => a.shiftId === id).length; }
  shiftHours(s:Shift):number {
    const [sh,sm] = s.start.split(':').map(Number), [eh,em]=s.end.split(':').map(Number);
    return ((eh*60+em)-(sh*60+sm)+1440)%1440;
  }
  shiftPercent(s:Shift):number {return Math.min(100,this.shiftHours(s)/1440*100);}
  shiftLeft(s:Shift):number {const [h,m]=s.start.split(':').map(Number);return (h*60+m)/1440*100;}
  shiftFirstWidth(s:Shift):number{return Math.min(this.shiftPercent(s),100-this.shiftLeft(s));}
  shiftWrapWidth(s:Shift):number{return Math.max(0,this.shiftPercent(s)-this.shiftFirstWidth(s));}
  activeCount():number{return this.shifts().filter(s=>s.active).length;}
  archivedCount():number{return this.shifts().filter(s=>!s.active).length;}
  overnight(s:Shift):boolean{return s.end < s.start;}
  closeOnEscape(event:KeyboardEvent){if(event.key==='Escape' && this.dialog)this.close();}
  openShift(s?:Shift){this.editingId=s?.id??'';this.shiftForm=s?{...s}:this.emptyShift();this.dialog='shift';}
  saveShift(){const f=this.shiftForm;if(!f.name.trim()||f.start===f.end||!Number.isFinite(+f.breakMinutes)||!Number.isFinite(+f.graceMinutes)||+f.breakMinutes<0||+f.breakMinutes>300||+f.graceMinutes<0||+f.graceMinutes>180||this.shiftHours(f)<=+f.breakMinutes){this.notice('Enter valid shift details');return;}if(this.editingId){this.shifts.update(list=>list.map(s=>s.id===this.editingId?{...f,version:s.version+1}:s));}else{this.shifts.update(list=>[...list,{...f,id:key()}]);}this.close();this.persist();}
  archiveShift(s:Shift){this.shifts.update(list=>list.map(x=>x.id===s.id?{...x,active:!x.active}:x));this.persist();}
  openAssign(e?:string,date?:string){this.assignForm={shiftId:this.activeShifts()[0]?.id??'',from:date??iso(new Date()),to:date??iso(new Date()),employeeIds:e?[e]:[],weekends:false,replace:false};this.dialog='assign';}
  toggleEmployee(id:string,checked:boolean){this.assignForm.employeeIds=checked?[...new Set([...this.assignForm.employeeIds,id])]:this.assignForm.employeeIds.filter(x=>x!==id);}
  selectAllEmployees(){this.assignForm.employeeIds=this.filteredPeople().map(e=>e.id);}
  saveAssignment(){const f=this.assignForm,s=this.shifts().find(x=>x.id===f.shiftId);if(!s||!f.employeeIds.length||!f.from||!f.to||f.to<f.from){this.notice('Choose a template, employees and valid dates');return;}const count=Math.round((new Date(f.to+'T12:00:00').getTime()-new Date(f.from+'T12:00:00').getTime())/86400000);if(count>90){this.notice('Choose a range of 91 days or less');return;}let rows=[...this.assignments()],added=0,skipped=0;for(let i=0;i<=count;i++){const date=dayAdd(f.from,i),weekend=[0,6].includes(new Date(date+'T12:00:00').getDay());if(weekend&&!f.weekends)continue;for(const id of f.employeeIds){const idx=rows.findIndex(x=>x.employeeId===id&&x.date===date);if(idx!==-1&&!f.replace){skipped++;continue;}if(idx!==-1)rows.splice(idx,1);rows.push({id:key(),employeeId:id,date,shiftId:s.id,shiftName:s.name,start:s.start,end:s.end,breakMinutes:s.breakMinutes,version:s.version});added++;}}this.assignments.set(rows);this.close();this.persist();this.notice(`${added} shifts assigned${skipped?` · ${skipped} existing skipped`:''}`);}
  removeAssignment(a:Assignment){if(!confirm(`Remove ${this.personName(a.employeeId)} shift for ${a.date}?`))return;this.assignments.update(xs=>xs.filter(x=>x.id!==a.id));this.persist();}
  openPermission(p?:Permission){this.editingId=p?.id??'';this.permissionForm=p?{...p}:this.emptyPermission();if(!p&&this.filteredPeople()[0])this.permissionForm.employeeId=this.filteredPeople()[0].id;this.dialog='permission';}
  savePermission(){const f=this.permissionForm;if(!f.employeeId||!f.date||!f.reason.trim()||!f.start||!f.end||f.start>=f.end){this.notice('Please complete a valid permission request');return;}const v={...f,id:f.id||key()};this.permissions.update(xs=>this.editingId?xs.map(x=>x.id===this.editingId?v:x):[v,...xs]);this.close();this.persist();}
  decidePermission(p:Permission,status:RequestState){this.permissions.update(xs=>xs.map(x=>x.id===p.id?{...x,status}:x));this.persist();}
  openPolicy(p?:Policy){this.editingId=p?.id??'';this.policyForm=p?{...p}:this.emptyPolicy();this.dialog='policy';}
  savePolicy(){const f=this.policyForm;if(!f.name.trim()||f.maxSessions<1||f.maxSessions>8){this.notice('Enter a name and 1–8 allowed sessions');return;}const v={...f,id:f.id||key(),version:this.editingId?f.version+1:1};this.policies.update(xs=>this.editingId?xs.map(x=>x.id===this.editingId?v:x):[...xs,v]);this.close();this.persist();}
  togglePolicy(p:Policy){this.policies.update(xs=>xs.map(x=>x.id===p.id?{...x,active:!x.active}:x));this.persist();}
  openPolicyAssign(){this.policyEmployee=this.filteredPeople()[0]?.id??'';this.policyId=this.policies().find(p=>p.active)?.id??'';this.policyEffective=iso(new Date());this.dialog='policyAssign';}
  savePolicyAssignment(){if(!this.policyEmployee||!this.policyId||!this.policyEffective){this.notice('Select employee, policy and effective date');return;}this.policyAssignments.update(xs=>[...xs,{employeeId:this.policyEmployee,policyId:this.policyId,effectiveDate:this.policyEffective}]);this.close();this.persist();}
  close(){this.dialog='';this.editingId='';}
}
