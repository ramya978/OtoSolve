import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PageHeader } from '../../Shared/layout/page-header/page-header';
import { UserDirectoryApiService } from '../../Service/user-directory-api.service';
import { IamAdminApiService } from '../../Service/iam-admin-api.service';

type Code = 'P'|'A'|'HD'|'L'|'U'|'WO'|'H';
type Panel = 'ledger'|'calendar'|'timeline';
interface Person { id:string; name:string; department:string; role:string; initials:string; }
interface Entry { status:Code; in:string; out:string; break:number; note:string; source:'demo'|'saved'; }
interface Day { date:string; number:number; weekday:string; status:Code; label:string; entry:Entry; minutes:number; late:number; }
const STORE = 'precision-attendance-v1';
const USER_STORE = 'ua-demo-overrides-v2';
const labels:Record<Code,string>={P:'Present',A:'Absent',HD:'Half day',L:'Approved leave',U:'Unmarked',WO:'Week off',H:'Holiday'};
const pad=(n:number)=>String(n).padStart(2,'0');
const dateParts=(s:string)=>{ const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12); };
const min=(s:string)=>/^\d{2}:\d{2}$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
const fmt=(n:number)=>`${Math.floor(n/60)}h ${pad(n%60)}m`;
const list=(x:any):any[]=>{
  for(const v of [x,x?.data,x?.result,x?.response,x?.data?.data]){
    if(Array.isArray(v))return v;
    if(v && typeof v==='object')for(const k of ['items','users','employees','results','content','records'])if(Array.isArray(v[k]))return v[k];
  }return [];
};
const nameOf=(x:any)=>String(x?.name??x?.departmentName??x?.department_name??x?.title??'').trim();
const mapPerson=(x:any, departments:Map<string,string>):Person|null=>{
  const id=x?.id??x?.userId??x?.user_id??x?.uuid??x?.employeeId;
  if(id===undefined||id===null)return null;
  const name=String(x?.fullName??x?.name??x?.displayName??([x?.firstName??x?.first_name,x?.lastName??x?.last_name].filter(Boolean).join(' '))).trim()||String(x?.email??id);
  const raw=x?.department??x?.departmentDetails??x?.departmentName??x?.department_name;
  const ref=x?.departmentId??x?.department_id??raw?.id??raw;
  const department=(typeof raw==='object'?nameOf(raw):'')||departments.get(String(ref??''))||(typeof raw==='string'&&!/^[0-9a-f-]{20,}$/i.test(raw)?raw:'Unassigned');
  return {id:String(id),name,department,role:String(x?.designation?.name??x?.designation??x?.role?.name??x?.jobTitle??'Employee'),initials:name.split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()).join('')};
};
@Component({selector:'app-user-attendance',standalone:true,imports:[PageHeader],templateUrl:'./user_attendance.html',styleUrls:['./user_attendance.css']})
export class IndividualAttendance {
  private readonly usersApi=inject(UserDirectoryApiService);
  private readonly deptApi=inject(IamAdminApiService);
  readonly people=signal<Person[]>([]);
  readonly departments=signal<string[]>([]);
  readonly loading=signal(true);
  readonly error=signal('');
  readonly selectedId=signal('');
  readonly panel=signal<Panel>('ledger');
  readonly month=signal(new Date().getFullYear()+'-'+pad(new Date().getMonth()+1));
  readonly selectedDate=signal('');
  readonly search=signal('');
  readonly statusFilter=signal('all');
  readonly showAll=signal(false);
  readonly statusOptions: Code[] = ['P', 'A', 'HD', 'L', 'WO', 'U', 'H'];
  readonly labels=labels;
  readonly weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  readonly overrides=signal<Record<string,Entry>>(this.readOverrides());
  readonly person=computed(()=>this.people().find(x=>x.id===this.selectedId())??null);
  readonly monthLabel=computed(()=>dateParts(this.month()+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}));
  readonly days=computed<Day[]>(()=>{
    const person=this.person();if(!person)return [];
    const [y,m]=this.month().split('-').map(Number);
    const max=new Date(y,m,0).getDate();
    return Array.from({length:max},(_,i)=>{
      const date=`${y}-${pad(m)}-${pad(i+1)}`;
      const day=dateParts(date), dow=day.getDay(),off=dow===0||dow===6;
      const entry=this.overrides()[`${date}|${person.id}`]??this.demoEntry(date,person.id,off);
      const start=min(entry.in),end=min(entry.out);
      const minutes=(entry.status==='P'||entry.status==='HD')&&start!==null&&end!==null&&end>start?Math.max(0,end-start-entry.break):0;
      return {date,number:i+1,weekday:day.toLocaleDateString('en-GB',{weekday:'short'}),status:entry.status,label:labels[entry.status],entry,minutes,late:entry.status==='P'&&start!==null?Math.max(0,start-550):0};
    });
  });
  readonly filteredDays=computed(()=>this.days().filter(d=>(this.statusFilter()==='all'||d.status===this.statusFilter())&&(!this.search()||`${d.date} ${d.weekday} ${d.label}`.toLowerCase().includes(this.search().toLowerCase()))));
  readonly focusDay=computed(()=>this.days().find(x=>x.date===this.selectedDate())??this.days().find(x=>x.status==='P')??this.days()[0]??null);
  readonly calendarPadding=computed(()=>{const d=this.days()[0];return d?Array.from({length:(dateParts(d.date).getDay()+6)%7},(_,i)=>i):[];});
  readonly summary=computed(()=>{
    const days=this.days(),count=(code:Code)=>days.filter(x=>x.status===code).length;
    const worked=days.reduce((s,x)=>s+x.minutes,0);
    const scheduled=days.filter(x=>x.status!=='WO'&&x.status!=='H').length;
    return {present:count('P'),absent:count('A'),half:count('HD'),leave:count('L'),off:count('WO'),unmarked:count('U'),worked,rate:scheduled?Math.round((count('P')+count('HD')*.5)/scheduled*100):0};
  });
  readonly sourceNote=computed(()=>this.overrides()[`${this.focusDay()?.date}|${this.person()?.id}`]?.source==='saved'?'Saved attendance':'Demonstration record');
  constructor(){void this.loadDirectory();}
  async loadDirectory(){
    this.loading.set(true);this.error.set('');
    try{
      const [u,d]=await Promise.all([firstValueFrom(this.usersApi.searchUsers({pageIndex:0,pageSize:1000})),firstValueFrom(this.deptApi.getDepartments())]);
      const depList=Array.isArray(d)?d:list(d),depMap=new Map<string,string>();
      depList.forEach(x=>{const name=nameOf(x),id=x?.id??x?.departmentId??x?.uuid;if(name&&id!=null)depMap.set(String(id),name);});
      const userRows=list(u);const people=userRows.map(x=>mapPerson(x,depMap)).filter((x):x is Person=>!!x);
      if(userRows.length&&!people.length)throw new Error('Users API response does not include usable employee IDs.');
      this.people.set(people);this.departments.set([...new Set(people.map(p=>p.department))]);
      if(!people.some(p=>p.id===this.selectedId()))this.selectedId.set(people[0]?.id??'');
      this.mergeExistingAttendance(people);
    }catch(e){this.error.set(e instanceof Error?e.message:String(e));this.people.set([]);}finally{this.loading.set(false);}
  }
  private hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
  private demoEntry(date:string,id:string,off:boolean):Entry{
    if(off)return {status:'WO',in:'',out:'',break:0,note:'Weekly off · demo',source:'demo'};
    const x=this.hash(id+'|'+date),category=x%31;
    const status:Code=category===0?'A':category===4?'L':category===9?'HD':'P';
    const shift=x%18, arrive=540+shift, dep=status==='HD'?780+shift:1080+shift;
    return {status,in:status==='P'||status==='HD'?`${pad(Math.floor(arrive/60))}:${pad(arrive%60)}`:'',out:status==='P'||status==='HD'?`${pad(Math.floor(dep/60))}:${pad(dep%60)}`:'',break:status==='P'?60:0,note:'Illustrative attendance only · not from attendance API',source:'demo'};
  }
  private readOverrides():Record<string,Entry>{try{return JSON.parse(localStorage.getItem(USER_STORE)||'{}')}catch{return {}}}
  private mergeExistingAttendance(people:Person[]){
    // Real manually saved values take precedence; seed fills only missing employee/date combinations.
    try{
      const raw=JSON.parse(localStorage.getItem(STORE)||'{}');
      const records=raw?.data??raw?.records??raw;
      if(!records||typeof records!=='object')return;
      const merged={...this.overrides()};const ids=new Set(people.map(p=>p.id));
      for(const [key,value] of Object.entries(records)){
        const [date,id]=key.split('|');const r=value as any;
        if(!ids.has(id)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!r||!['P','A','HD','L','U','WO','H'].includes(r.status))continue;
        if(merged[key])continue;
        merged[key]={status:r.status,in:r.in??'',out:r.out??'',break:Number(r.break??0),note:r.note??'',source:'saved'};
      }this.overrides.set(merged);
    }catch{/* Demo continues when shared attendance storage is unavailable. */}
  }
  selectEmployee(id:string){this.selectedId.set(id);this.selectedDate.set('');this.statusFilter.set('all');}
  moveMonth(delta:number){const [y,m]=this.month().split('-').map(Number);const d=new Date(y,m-1+delta,1);this.month.set(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);this.selectedDate.set('');}
  selectDay(date:string){this.selectedDate.set(date);}
  displayTime(s:string){return s||'—';}
  worked(n:number){return n?fmt(n):'—';}
  position(time:string){const v=min(time);return v===null?0:v/1440*100;}
  span(a:string,b:string){const x=min(a),y=min(b);return x===null||y===null||y<=x?0:(y-x)/1440*100;}
  exportCsv(){
    const e=this.person();if(!e)return;
    const lines=[['Date','Day','Status','Check-in','Check-out','Break minutes','Worked minutes','Source'],...this.days().map(d=>[d.date,d.weekday,d.status,d.entry.in,d.entry.out,d.entry.break,d.minutes,d.entry.source])];
    const csv='\ufeff'+lines.map(r=>r.map(s=>'"'+String(s).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`user-attendance-${e.id}-${this.month()}.csv`;anchor.click();URL.revokeObjectURL(url);
  }
}
