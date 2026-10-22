export type ActionKey = 'view' | 'export' | 'create' | 'edit' | 'approve' | 'operate' | 'submit';
export type Tone = 'success' | 'warning' | 'info' | 'danger' | 'muted';

export interface ActionDef { key: ActionKey; label: string; tone: Tone; }

export interface Permission {
  code: string;
  name: string;
  group: string;
  module: string;
  action: ActionKey;
  sensitive: boolean;
}

export const ACTIONS: ActionDef[] = [
  { key: 'view',    label: 'View',    tone: 'info' },
  { key: 'export',  label: 'Export',  tone: 'info' },
  { key: 'create',  label: 'Create',  tone: 'success' },
  { key: 'edit',    label: 'Edit',    tone: 'success' },
  { key: 'approve', label: 'Approve', tone: 'warning' },
  { key: 'operate', label: 'Operate', tone: 'muted' },
  { key: 'submit',  label: 'Submit',  tone: 'muted' }
];

/** SAMPLE DATA: replace with your API / real catalogue (255 rows in your case). */
export const PERMISSIONS: Permission[] = [
  { code: 'cam.attribution.view',               name: 'View donation attribution',        group: 'Attribution', module: 'Campaigns', action: 'view',    sensitive: false },
  { code: 'cam.attribution.export',             name: 'Export attributed donations',      group: 'Attribution', module: 'Campaigns', action: 'export',  sensitive: true },
  { code: 'cam.attribution.request-correction', name: 'Request an attribution correction', group: 'Attribution', module: 'Campaigns', action: 'submit',  sensitive: false },
  { code: 'cam.budget-plans.view',              name: 'View budget and target plans',     group: 'BudgetPlans', module: 'Campaigns', action: 'view',    sensitive: false },
  { code: 'cam.budget-plans.allocate',          name: 'Allocate budget and target plans', group: 'BudgetPlans', module: 'Campaigns', action: 'create',  sensitive: false },
  { code: 'cam.budget-plans.revise',            name: 'Revise budget and target plans',   group: 'BudgetPlans', module: 'Campaigns', action: 'edit',    sensitive: false },
  { code: 'cam.budget-plans.submit',            name: 'Submit budget plans for approval', group: 'BudgetPlans', module: 'Campaigns', action: 'submit',  sensitive: false },
  { code: 'cam.budget-plans.approve',           name: 'Approve budget plans',             group: 'BudgetPlans', module: 'Campaigns', action: 'approve', sensitive: true },
  { code: 'cam.budget-plans.reject',            name: 'Reject budget plans',              group: 'BudgetPlans', module: 'Campaigns', action: 'approve', sensitive: false },
  { code: 'cam.budget-plans.export',            name: 'Export budget plans',              group: 'BudgetPlans', module: 'Campaigns', action: 'export',  sensitive: true },
  { code: 'don.leads.view',                     name: 'View donor leads',                 group: 'Leads',       module: 'Donors & Leads', action: 'view',   sensitive: false },
  { code: 'don.leads.create',                   name: 'Create donor leads',               group: 'Leads',       module: 'Donors & Leads', action: 'create', sensitive: false },
  { code: 'don.donors.export',                  name: 'Export donor list',                group: 'Donors',      module: 'Donors & Leads', action: 'export', sensitive: true },
  { code: 'iam.roles.edit',                     name: 'Edit roles',                       group: 'Roles',       module: 'Identity and Access', action: 'edit',    sensitive: true },
  { code: 'iam.users.operate',                  name: 'Suspend or restore users',         group: 'Users',       module: 'Identity and Access', action: 'operate', sensitive: true },
  { code: 'plt.settings.view',                  name: 'View platform settings',           group: 'Settings',    module: 'Platform', action: 'view', sensitive: false }
];
