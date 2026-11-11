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
