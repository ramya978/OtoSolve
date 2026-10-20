import { AccessRequest } from "./iam-data";

export interface SeedUser { name: string; email: string; }
export interface SeedRole { code: string; name: string; privileged: boolean; }

export const SEED_USERS: SeedUser[] = [
  { name: 'Ritu Sharma',   email: 'ritu.sharma@acme.in' },
  { name: 'Arun Kumar',    email: 'arun.kumar@acme.in' },
  { name: 'Priya Nair',    email: 'priya.nair@acme.in' },
  { name: 'Karthik Raja',  email: 'karthik.raja@acme.in' },
  { name: 'Meena Iyer',    email: 'meena.iyer@acme.in' },
  { name: 'Suresh Babu',   email: 'suresh.babu@acme.in' },
  { name: 'Divya Menon',   email: 'divya.menon@acme.in' },
  { name: 'Vikram Singh',  email: 'vikram.singh@acme.in' }
];

export const SEED_ROLES: SeedRole[] = [
  { code: 'ADMIN',         name: 'Administrator',    privileged: true },
  { code: 'BILLING_ADMIN', name: 'Billing admin',    privileged: true },
  { code: 'APPROVER',      name: 'Campaign approver', privileged: false },
  { code: 'EDITOR',        name: 'Content editor',   privileged: false },
  { code: 'AUDITOR',       name: 'Auditor',          privileged: false },
  { code: 'SUPPORT',       name: 'Support agent',    privileged: false },
  { code: 'VIEWER',        name: 'Read-only viewer', privileged: false }
];

export const SEED_REQUESTS: AccessRequest[] = [
  { ref: 'ACR-0010', person: 'Karthik Raja', role: 'ADMIN', status: 'pending',
    reason: 'Need admin rights for the quarterly user clean-up and to rotate service accounts.',
    createdAt: '2026-10-20T09:15:00.000Z', until: '2026-11-20' },
  { ref: 'ACR-0009', person: 'Meena Iyer', role: 'APPROVER', status: 'pending',
    reason: 'Covering campaign approvals while Ritu is on leave until the end of the month.',
    createdAt: '2026-10-19T14:40:00.000Z', until: '2026-10-31' },
  { ref: 'ACR-0008', person: 'Suresh Babu', role: 'BILLING_ADMIN', status: 'pending',
    reason: 'Month-end invoice reconciliation and refund handling for the finance team.',
    createdAt: '2026-10-18T11:05:00.000Z', until: '' },
  { ref: 'ACR-0007', person: 'Priya Nair', role: 'EDITOR', status: 'approved',
    reason: 'Publishing the Diwali landing page and updating product copy.',
    createdAt: '2026-10-15T08:30:00.000Z', until: '2026-11-15' },
  { ref: 'ACR-0006', person: 'Arun Kumar', role: 'AUDITOR', status: 'approved',
    reason: 'Internal ISO 27001 audit needs read access to logs and access reviews.',
    createdAt: '2026-10-12T10:20:00.000Z', until: '2026-12-31' },
  { ref: 'ACR-0005', person: 'Divya Menon', role: 'SUPPORT', status: 'approved',
    reason: 'Joined the L2 support rota; needs to look up customer accounts.',
    createdAt: '2026-10-09T13:00:00.000Z', until: '' },
  { ref: 'ACR-0004', person: 'Vikram Singh', role: 'ADMIN', status: 'rejected',
    reason: 'Wants admin access to speed up deployments.',
    createdAt: '2026-10-07T16:45:00.000Z', until: '' },
  { ref: 'ACR-0003', person: 'Ritu Sharma', role: 'VIEWER', status: 'withdrawn',
    reason: 'Needed a dashboard view for a workshop; sorted out through a shared report instead.',
    createdAt: '2026-10-05T09:10:00.000Z', until: '2026-10-10' },
  { ref: 'ACR-0002', person: 'Priya Nair', role: 'APPROVER', status: 'approved',
    reason: 'Backup approver for the festive campaign sign-off.',
    createdAt: '2026-10-02T12:25:00.000Z', until: '2026-10-25' },
  { ref: 'ACR-0001', person: 'Karthik Raja', role: 'VIEWER', status: 'rejected',
    reason: 'General access to the reports area (no specific need given).',
    createdAt: '2026-09-29T15:50:00.000Z', until: '' }
];
