import { Injectable, computed, signal } from '@angular/core';

/* ---- route paths: keep in sync with the organisation routes in app.routes.ts ---- */
export const ORG_PATH = '/app/administration/organisation';
export const OFFICES_PATH = ORG_PATH + '/units';
export const ADD_OFFICE_PATH = OFFICES_PATH + '/new';

/* ---- models ---- */
export interface Person { id: string; name: string; deptId: string; officeId: string; }

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  parentId: string | null;
  headId: string | null;
  order: number;
  active: boolean;
}

export interface Office {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  managerId: string | null;
  email: string;
  phone: string;
  timezone: string;
  description: string;
  order: number;
  active: boolean;
  address1: string;
  address2: string;
  country: string;
  state: string;
  city: string;
  postal: string;
}

export interface Security {
  twoStep: 'optional' | 'required';
  maxFailed: number;
  lockoutMin: number;
  idleMin: number;
  minLength: number;
  expireDays: number;
}

/* ---- shared icons (24x24 stroke paths) ---- */
export const ICONS: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  chevron: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  checkcircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3',
  offcircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8',
  check: 'M20 6L9 17l-5-5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  hash: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  userstar: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4',
  org: 'M12 3v5M5 14v-3h14v3M12 8v3M3 14h4v4H3zM10 14h4v4h-4zM17 14h4v4h-4z',
  order: 'M3 6h12M3 12h8M3 18h5M17 8v10M14 15l3 3 3-3',
  docok: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 14l2 2 4-4',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  save: 'M5 3h11l4 4v14H5zM8 3v5h7V3M8 21v-7h8v7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v5M9 2h6',
  length: 'M4 6h16M4 12h10M4 18h6',
  calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4'
};

export function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Moves keyboard focus into the open popup. */
export function focusDialog(): void {
  setTimeout(() => document.querySelector<HTMLElement>('.og-dialog')?.focus());
}

/* ---- sample data (replaced by the API later) ---- */
const ORG = {
  name: 'Smile Foundation',
  verified: true,
  code: 'TEN001',
  domain: 'smilefoundation.localhost',
  type: 'Non-profit / NGO',
  since: 'Oct 2026',
  peopleUsed: 21,
  peopleLimit: 50,
  administrator: 'Anjali Prakash',
  updated: '14 Oct 2026'
};

const PEOPLE: Person[] = [
  { id: 'p1', name: 'Anjali Prakash', deptId: 'd-adm', officeId: 'o-ho' },
  { id: 'p2', name: 'Rohan Suresh', deptId: 'd-cam', officeId: 'o-ho' },
  { id: 'p3', name: 'Kavita Ashok', deptId: 'd-ig', officeId: 'o-ho' },
  { id: 'p4', name: 'Neha Rajesh', deptId: 'd-dc', officeId: 'o-ho' },
  { id: 'p5', name: 'Arjun Mehta', deptId: 'd-cam', officeId: 'o-ho' },
  { id: 'p6', name: 'Divya Nair', deptId: 'd-ig', officeId: 'o-ho' },
  { id: 'p7', name: 'Imran Qureshi', deptId: 'd-cam', officeId: 'o-mum' },
  { id: 'p8', name: 'Lakshmi Iyer', deptId: 'd-ig', officeId: 'o-blr' },
  { id: 'p9', name: 'Sandeep Rao', deptId: 'd-dc', officeId: 'o-hyd' }
];

const dept = (id: string, code: string, name: string, description: string, order: number, headId: string | null): Department =>
  ({ id, code, name, description, parentId: null, headId, order, active: true });

const DEPARTMENTS: Department[] = [
  dept('d-adm', 'ADM', 'Administration and Operations', 'Office administration, compliance, vendors and platform administration.', 10, 'p1'),
  dept('d-cam', 'CAM', 'Campaigns and Communications', 'Fundraising campaigns, digital media, events and supporter outreach.', 20, 'p2'),
  dept('d-ig', 'IG', 'Individual Giving', 'Donor acquisition, lead management and supporter engagement.', 30, 'p3'),
  dept('d-dc', 'DC', 'Donor Care', 'Supporter queries, receipts, 80G certificates and donor retention.', 40, 'p4'),
  dept('d-prog', 'PROG', 'Programmes', "Education, healthcare, livelihood and women's empowerment programmes.", 50, null),
  dept('d-fin', 'FIN', 'Finance and Accounts', 'Receipting, reconciliation, statutory filings and audit support.', 60, null),
  dept('d-hr', 'HR', 'Human Resources', 'Recruitment, onboarding, payroll and staff welfare.', 70, null),
  dept('d-it', 'IT', 'Technology', 'Systems, data protection and information security.', 80, null)
];

const office = (id: string, code: string, name: string, kind: string, order: number, city: string, state: string, slug: string): Office => ({
  id, code, name, kind, parentId: null, managerId: null,
  email: `${slug}@smilefoundationindia.test`, phone: '', timezone: 'Asia/Kolkata', description: '', order, active: true,
  address1: 'Sample address line', address2: '', country: 'India', state, city, postal: ''
});

const OFFICES: Office[] = [
  {
    ...office('o-ho', 'HO', 'Head Office - New Delhi', 'Head Office', 10, 'New Delhi', 'Delhi', 'headoffice'),
    address1: '161 B/4, 3rd Floor, Gulmohar House',
    address2: 'Yusuf Sarai Community Centre',
    postal: '110049'
  },
  office('o-mum', 'MUM', 'Mumbai Regional Office', 'Regional office', 20, 'Mumbai', 'Maharashtra', 'mumbai'),
  office('o-blr', 'BLR', 'Bengaluru Regional Office', 'Regional office', 30, 'Bengaluru', 'Karnataka', 'bengaluru'),
  office('o-hyd', 'HYD', 'Hyderabad Regional Office', 'Regional office', 40, 'Hyderabad', 'Telangana', 'hyderabad'),
  office('o-kol', 'KOL', 'Kolkata Regional Office', 'Regional office', 50, 'Kolkata', 'West Bengal', 'kolkata'),
  office('o-chn', 'CHN', 'Chennai Regional Office', 'Regional office', 60, 'Chennai', 'Tamil Nadu', 'chennai')
];

/** One in-memory store shared by Profile, Departments, Branches, Add Office and Settings. */
@Injectable({ providedIn: 'root' })
export class OrgStore {
  readonly org = ORG;
  readonly people = signal<Person[]>(PEOPLE);
  readonly departments = signal<Department[]>(DEPARTMENTS);
  readonly offices = signal<Office[]>(OFFICES);
  readonly security = signal<Security>({
    twoStep: 'optional', maxFailed: 5, lockoutMin: 15, idleMin: 30, minLength: 10, expireDays: 0
  });

  readonly sortedDepartments = computed(() => [...this.departments()].sort((a, b) => a.order - b.order));
  readonly sortedOffices = computed(() => [...this.offices()].sort((a, b) => a.order - b.order));

  person(id: string | null): Person | null {
    return id ? this.people().find((p) => p.id === id) ?? null : null;
  }

  deptPeople(id: string): number { return this.people().filter((p) => p.deptId === id).length; }
  officePeople(id: string): number { return this.people().filter((p) => p.officeId === id).length; }
  deptChildren(id: string): number { return this.departments().filter((d) => d.parentId === id).length; }
  officeChildren(id: string): number { return this.offices().filter((o) => o.parentId === id).length; }

  nextDeptOrder(): number { return Math.max(0, ...this.departments().map((d) => d.order)) + 10; }
  nextOfficeOrder(): number { return Math.max(0, ...this.offices().map((o) => o.order)) + 10; }

  newId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}`; }

  upsertDepartment(d: Department): void {
    this.departments.update((list) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d]));
  }
  removeDepartment(id: string): void { this.departments.update((list) => list.filter((d) => d.id !== id)); }

  upsertOffice(o: Office): void {
    this.offices.update((list) => (list.some((x) => x.id === o.id) ? list.map((x) => (x.id === o.id ? o : x)) : [...list, o]));
  }
  removeOffice(id: string): void { this.offices.update((list) => list.filter((o) => o.id !== id)); }
}
