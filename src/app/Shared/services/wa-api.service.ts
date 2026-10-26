import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/* =====================================================================================================
   WHATSAPP + NUMBER VERIFICATION - API
   One place for every call both pages make. Change WA_API (and a path below, if yours differs) to match
   the backend. Every list goes through asList(), so a wrapped answer ({ items }, { data } …) never breaks
   a page with "r.map is not a function".
   ===================================================================================================== */

/** Base route of the backend. */
export const WA_API = '/api/communications/whatsapp';

/** Price of one live WhatsApp lookup, used when the server does not send one. */
export const COST_PER_CHECK = 0.005;

export interface WaSummary {
  numbersReady: number;      // verified, on WhatsApp, ready to message
  messagesSent: number;
  readRate: number;          // 0-100
  numbersVerified: number;
  onWhatsApp: number;
  jobsRun: number;
  costPerCheck: number;
  workerReady: boolean;
  workerNote: string | null;
}

export interface WaContact { number: string; name: string; campaign: string | null; verifiedAt: string | null; }
export interface WaTemplate { id: string; name: string; language: string; category: string; body: string; params: string[]; }
export interface WaCampaign { id: string; name: string; }

export type WaMsgStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed';
export interface WaMessage {
  id: string; number: string; name: string; broadcast: string; template: string;
  status: WaMsgStatus; sentAt: string | null; updatedAt: string | null; error: string | null;
}

export type WaJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface WaJob {
  id: string; taskId: string | null; fileName: string; campaign: string | null; status: WaJobStatus;
  total: number; checked: number; onWhatsApp: number; notOnWhatsApp: number; failed: number;
  cost: number; createdAt: string; finishedAt: string | null; error: string | null;
}
export interface WaResult { number: string; onWhatsApp: boolean | null; reason: string | null; }

export interface WaSendRequest { broadcastName: string; templateId: string; params: string[]; numbers: string[]; }
export interface WaJobRequest { fileName: string; campaignId: string | null; numbers: string[]; }

/* ---------- answer shapes ---------- */
type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => !!v && typeof v === 'object' && !Array.isArray(v);

/** Always an array: the answer itself, or the first list found under items / data / rows / results / value. */
export function asList<T>(r: unknown, depth = 0): T[] {
  if (Array.isArray(r)) return r as T[];
  if (!isBag(r) || depth > 2) return [];
  for (const k of ['items', 'data', 'rows', 'results', 'value', 'records']) {
    const found = asList<T>(r[k], depth + 1);
    if (found.length || Array.isArray(r[k])) return found;
  }
  return [];
}

/** The object itself, or the one under `data` / `result`. */
function asObj(r: unknown): Bag {
  if (!isBag(r)) return {};
  for (const k of ['data', 'result', 'value']) if (isBag(r[k])) return r[k] as Bag;
  return r;
}

const str = (v: unknown, d = ''): string => (v === null || v === undefined ? d : String(v));
const num = (v: unknown, d = 0): number => { const n = Number(v); return isFinite(n) ? n : d; };
const pick = (o: Bag, ...keys: string[]): unknown => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

const MSG: WaMsgStatus[] = ['pending', 'sent', 'delivered', 'read', 'replied', 'failed'];
const JOB: WaJobStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled'];
const statusOf = <T extends string>(v: unknown, all: T[], d: T): T => {
  const k = str(v).toLowerCase();
  return all.find((s) => k.startsWith(s)) ?? (k === 'inprogress' || k === 'processing' ? ('running' as T) : d);
};

function toContact(o: Bag): WaContact {
  return {
    number: str(pick(o, 'number', 'phone', 'phoneNumber', 'whatsappNumber')),
    name: str(pick(o, 'name', 'displayName', 'contactName')),
    campaign: (pick(o, 'campaign', 'campaignName') as string) ?? null,
    verifiedAt: (pick(o, 'verifiedAt', 'verifiedAtUtc', 'checkedAtUtc') as string) ?? null
  };
}
function toTemplate(o: Bag): WaTemplate {
  const body = str(pick(o, 'body', 'text', 'content'));
  const params = asList<string>(pick(o, 'params', 'parameters', 'variables'));
  const found = (body.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/[{}\s]/g, ''));
  return {
    id: str(pick(o, 'id', 'templateId', 'name')), name: str(pick(o, 'name', 'templateName', 'elementName')),
    language: str(pick(o, 'language', 'languageCode'), 'en'), category: str(pick(o, 'category'), 'Utility'),
    body, params: params.length ? params.map((p) => str(isBag(p) ? pick(p, 'name', 'key') : p)) : [...new Set(found)]
  };
}
function toMessage(o: Bag): WaMessage {
  return {
    id: str(pick(o, 'id', 'messageId')), number: str(pick(o, 'number', 'phone', 'waId', 'whatsappNumber')),
    name: str(pick(o, 'name', 'contactName')), broadcast: str(pick(o, 'broadcast', 'broadcastName')),
    template: str(pick(o, 'template', 'templateName')), status: statusOf(pick(o, 'status', 'state'), MSG, 'pending'),
    sentAt: (pick(o, 'sentAt', 'sentAtUtc', 'createdAtUtc') as string) ?? null,
    updatedAt: (pick(o, 'updatedAt', 'updatedAtUtc', 'lastStatusAtUtc') as string) ?? null,
    error: (pick(o, 'error', 'failureReason', 'errorMessage') as string) ?? null
  };
}
function toJob(o: Bag): WaJob {
  return {
    id: str(pick(o, 'id', 'jobId')), taskId: (pick(o, 'taskId', 'externalTaskId') as string) ?? null,
    fileName: str(pick(o, 'fileName', 'sourceFileName', 'name')), campaign: (pick(o, 'campaign', 'campaignName') as string) ?? null,
    status: statusOf(pick(o, 'status', 'state'), JOB, 'queued'),
    total: num(pick(o, 'total', 'totalNumbers')), checked: num(pick(o, 'checked', 'processed', 'checkedCount')),
    onWhatsApp: num(pick(o, 'onWhatsApp', 'validCount', 'onWhatsAppCount')), notOnWhatsApp: num(pick(o, 'notOnWhatsApp', 'invalidCount', 'notOnWhatsAppCount')),
    failed: num(pick(o, 'failed', 'failedCount', 'errorCount')), cost: num(pick(o, 'cost', 'estimatedCost', 'chargedAmount')),
    createdAt: str(pick(o, 'createdAt', 'createdAtUtc', 'startedAtUtc')), finishedAt: (pick(o, 'finishedAt', 'completedAtUtc', 'finishedAtUtc') as string) ?? null,
    error: (pick(o, 'error', 'errorMessage', 'failureReason') as string) ?? null
  };
}
function toResult(o: Bag): WaResult {
  const v = pick(o, 'onWhatsApp', 'isOnWhatsApp', 'exists', 'valid');
  return { number: str(pick(o, 'number', 'phone', 'phoneNumber')), onWhatsApp: v === undefined ? null : !!v, reason: (pick(o, 'reason', 'error') as string) ?? null };
}

@Injectable({ providedIn: 'root' })
export class WaApiService {
  private readonly http = inject(HttpClient);

  summary(): Observable<WaSummary> {
    return this.http.get(`${WA_API}/summary`).pipe(map((r) => {
      const o = asObj(r);
      return {
        numbersReady: num(pick(o, 'numbersReady', 'readyCount')), messagesSent: num(pick(o, 'messagesSent', 'sentCount')),
        readRate: num(pick(o, 'readRate', 'readPercent')), numbersVerified: num(pick(o, 'numbersVerified', 'verifiedCount')),
        onWhatsApp: num(pick(o, 'onWhatsApp', 'onWhatsAppCount')), jobsRun: num(pick(o, 'jobsRun', 'jobCount')),
        costPerCheck: num(pick(o, 'costPerCheck', 'pricePerCheck'), COST_PER_CHECK),
        workerReady: pick(o, 'workerReady', 'isWorkerConfigured') !== false,
        workerNote: (pick(o, 'workerNote', 'workerMessage') as string) ?? null
      };
    }));
  }

  /** Numbers that passed verification and are on WhatsApp. */
  contacts(): Observable<WaContact[]> {
    return this.http.get(`${WA_API}/contacts`).pipe(map((r) => asList<Bag>(r).map(toContact)));
  }
  templates(): Observable<WaTemplate[]> {
    return this.http.get(`${WA_API}/templates`).pipe(map((r) => asList<Bag>(r).map(toTemplate)));
  }
  campaigns(): Observable<WaCampaign[]> {
    return this.http.get(`${WA_API}/campaigns`).pipe(map((r) => asList<Bag>(r).map((o) => ({ id: str(pick(o, 'id', 'value')), name: str(pick(o, 'name', 'label')) }))));
  }
  messages(): Observable<WaMessage[]> {
    return this.http.get(`${WA_API}/messages`).pipe(map((r) => asList<Bag>(r).map(toMessage)));
  }
  send(body: WaSendRequest): Observable<unknown> {
    return this.http.post(`${WA_API}/broadcasts`, body);
  }

  /** Numbers already checked before: their saved result, so they are not paid for twice. */
  saved(numbers: string[]): Observable<WaResult[]> {
    return this.http.post(`${WA_API}/numbers/saved`, { numbers }).pipe(map((r) => asList<Bag>(r).map(toResult)));
  }
  jobs(): Observable<WaJob[]> {
    return this.http.get(`${WA_API}/jobs`).pipe(map((r) => asList<Bag>(r).map(toJob)));
  }
  job(id: string): Observable<WaJob> {
    return this.http.get(`${WA_API}/jobs/${id}`).pipe(map((r) => toJob(asObj(r))));
  }
  jobResults(id: string): Observable<WaResult[]> {
    return this.http.get(`${WA_API}/jobs/${id}/results`).pipe(map((r) => asList<Bag>(r).map(toResult)));
  }
  createJob(body: WaJobRequest): Observable<WaJob> {
    return this.http.post(`${WA_API}/jobs`, body).pipe(map((r) => toJob(asObj(r))));
  }
  cancelJob(id: string): Observable<unknown> {
    return this.http.post(`${WA_API}/jobs/${id}/cancel`, {});
  }
}
