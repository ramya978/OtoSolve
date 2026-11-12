import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap, timer } from 'rxjs';
import { TicketApi } from '../data/ticket-api';
import {
  Agent, EMPTY_QUERY, KbArticle, STATUS_META, Sentiment, Ticket, TicketBundle, TicketCategory, TicketLookups, TicketPriority,
} from '../models/ticket.model';
import { TICKETS_CONFIG } from '../tickets.config';
import { relativeTime } from '../utils/format';
import { TicketService } from './ticket.service';

/* =====================================================================================================
   AI ASSISTANCE

   Every feature is a SUGGESTION an agent accepts, edits or ignores; nothing here changes a ticket.

   Two providers implement the same interface:
   - HeuristicAiProvider: keyword, similarity and workload rules that run on the demo data, so every
     widget works today and shows the shape of the real thing. Its output is labelled "Rules preview".
   - GatewayAiProvider: posts to the OtoSolve AI gateway (TICKETS_CONFIG.aiBaseUrl). The gateway holds
     the model credentials, redacts personal data and logs prompts; the browser never calls a model
     provider directly.
   ===================================================================================================== */

export type AiSource = 'rules' | 'model';

export interface AiSummary {
  readonly headline: string;
  readonly bullets: readonly string[];
  readonly nextStep: string;
  readonly source: AiSource;
}

export interface Recommendation<T> {
  readonly value: T;
  /** 0–1. */
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface SentimentResult extends Recommendation<Sentiment> {
  /** -1 (very negative) … +1 (very positive). */
  readonly score: number;
}

export interface SimilarTicket {
  readonly ticket: Ticket;
  /** 0–1 similarity. */
  readonly score: number;
}

export interface AssigneeSuggestion {
  readonly agent: Agent;
  readonly score: number;
  readonly openTickets: number;
  readonly reasons: readonly string[];
}

export interface ResolutionSuggestion {
  readonly steps: readonly string[];
  readonly fromTickets: readonly { id: string; number: string; subject: string; resolution: string }[];
  readonly articles: readonly KbArticle[];
}

export interface TicketInsights {
  readonly summary: AiSummary;
  readonly priority: Recommendation<TicketPriority>;
  readonly category: Recommendation<TicketCategory>;
  readonly sentiment: SentimentResult;
  readonly duplicates: readonly SimilarTicket[];
  readonly assignees: readonly AssigneeSuggestion[];
  readonly resolution: ResolutionSuggestion;
  readonly articles: readonly KbArticle[];
  readonly source: AiSource;
}

/** What the create form asks about while someone types. */
export interface DraftInsights {
  readonly priority: Recommendation<TicketPriority>;
  readonly category: Recommendation<TicketCategory>;
  readonly sentiment: SentimentResult;
  readonly duplicates: readonly SimilarTicket[];
  readonly articles: readonly KbArticle[];
}

export abstract class AiProvider {
  abstract insights(bundle: TicketBundle, lookups: TicketLookups): Observable<TicketInsights>;
  abstract draftInsights(subject: string, description: string, customerId: string | null, lookups: TicketLookups): Observable<DraftInsights>;
  abstract smartReply(bundle: TicketBundle, lookups: TicketLookups, agentName: string, tone: 'friendly' | 'formal' | 'brief'): Observable<string>;
}

/* ---------------- text helpers ---------------- */

const STOP = new Set('the and for are but not you your with this that have has from was were our can could would will what when where which there their them they into been just about also more than then very how why its it’s is in on at to of a an or by be as we i me my so if do does did please thanks thank hi hello since'.split(' '));

export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

function hits(text: string, words: readonly string[]): string[] {
  const t = ` ${text.toLowerCase()} `;
  return words.filter((w) => t.includes(w));
}

const PRIORITY_WORDS: Readonly<Record<TicketPriority, readonly string[]>> = {
  Critical: ['outage', 'blank', 'down', 'all donors', 'going live', 'tonight', 'locked out', 'wrong pan', 'charged twice', 'urgent', 'asap', 'immediately', 'data loss'],
  High: ['fails', 'failed', 'error', 'refund', 'not delivered', 'not being delivered', 'late', 'missing', 'times out', 'timeout', '404', 'cannot', "can't", 'audit', 'upset'],
  Medium: ['does not match', 'not charged', 'not showing', 'rejected', 'invalid'],
  Low: ['how do', 'how can', 'feature', 'would like', 'would help', 'could someone', 'training', 'suggestion', 'possible'],
};

const CATEGORY_WORDS: Readonly<Record<TicketCategory, readonly string[]>> = {
  Technical: ['page', 'screen', 'error', 'qr', '404', 'import', 'export', 'whatsapp', 'dashboard', 'report', 'times out', 'blank', 'mobile', 'browser', 'bug'],
  Billing: ['invoice', 'charged', 'refund', 'gst', 'payment', 'settlement', 'card', 'subscription', 'plan', 'billing'],
  Account: ['sign in', 'login', 'password', 'mfa', 'two-factor', 'locked', 'admin', 'access', 'authenticator', 'email address'],
  Donation: ['donation', 'donor', 'receipt', '80g', 'pan', 'recurring', 'mandate', 'cheque', 'campaign total'],
  'Feature Request': ['would like', 'would help', 'could the', 'feature', 'add ', 'schedule', 'language', 'it would'],
  General: ['how do', 'where can', 'training', 'walkthrough', 'archive', 'question'],
};

const POSITIVE = ['thanks', 'thank you', 'great', 'appreciate', 'helpful', 'love', 'perfect', 'works now', 'resolved'];
const NEGATIVE = ['upset', 'frustrated', 'again', 'still', 'never', 'wrong', 'fails', 'failed', 'angry', 'disappointed', 'unacceptable', 'not received', 'no longer'];
const URGENT = ['urgent', 'asap', 'immediately', 'tonight', 'locked out', 'audit', 'deadline', 'quickly', 'going live'];

function scoreMap<K extends string>(text: string, table: Readonly<Record<K, readonly string[]>>): { key: K; score: number; matched: string[] }[] {
  return (Object.keys(table) as K[]).map((key) => {
    const matched = hits(text, table[key]);
    return { key, score: matched.length, matched };
  }).sort((a, b) => b.score - a.score);
}

/* ---------------- heuristic provider ---------------- */

@Injectable()
export class HeuristicAiProvider extends AiProvider {
  private readonly api = inject(TicketApi);
  private readonly tickets = inject(TicketService);
  private corpusAt = -1;
  private corpusCache$: Observable<readonly Ticket[]> | null = null;
  private readonly kb$ = this.api.knowledgeBase().pipe(shareReplay({ bufferSize: 1, refCount: false }));

  /** Every visible ticket, re-read after any change so new tickets count as duplicates. */
  private get corpus$(): Observable<readonly Ticket[]> {
    const rev = this.tickets.revision();
    if (!this.corpusCache$ || rev !== this.corpusAt) {
      this.corpusAt = rev;
      this.corpusCache$ = timer(0).pipe(
        switchMap(() => this.api.list({ ...EMPTY_QUERY, pageSize: 10_000 })),
        map((p) => p.items),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.corpusCache$;
  }

  priority(text: string, tier: string | undefined, sentiment: Sentiment): Recommendation<TicketPriority> {
    const crit = hits(text, PRIORITY_WORDS.Critical);
    const high = hits(text, PRIORITY_WORDS.High);
    const med = hits(text, PRIORITY_WORDS.Medium);
    const low = hits(text, PRIORITY_WORDS.Low);
    let score = crit.length * 3 + high.length * 1.6 + med.length * 0.8 - low.length * 1.2;
    const reasons: string[] = [];
    if (crit.length) reasons.push(`Mentions ${crit.slice(0, 3).map((w) => `“${w}”`).join(', ')}`);
    if (high.length) reasons.push(`Signals a failure: ${high.slice(0, 3).map((w) => `“${w}”`).join(', ')}`);
    if (low.length && !crit.length) reasons.push(`Reads as a question or request (${low.slice(0, 2).map((w) => `“${w}”`).join(', ')})`);
    if (tier === 'VIP') { score += 1.5; reasons.push('VIP customer'); } else if (tier === 'Premium') { score += 0.6; reasons.push('Premium customer'); }
    if (sentiment === 'Urgent') { score += 1.5; reasons.push('Customer sounds urgent'); } else if (sentiment === 'Negative') { score += 0.6; reasons.push('Customer sounds unhappy'); }
    const value: TicketPriority = score >= 4.5 ? 'Critical' : score >= 2 ? 'High' : score >= 0.5 ? 'Medium' : 'Low';
    if (!reasons.length) reasons.push('No urgency signals found in the text');
    return { value, confidence: Math.min(0.95, 0.45 + Math.abs(score) / 10), reasons };
  }

  category(text: string): Recommendation<TicketCategory> {
    const ranked = scoreMap(text, CATEGORY_WORDS);
    const top = ranked[0];
    const total = ranked.reduce((n, r) => n + r.score, 0);
    if (!top.score) return { value: 'General', confidence: 0.35, reasons: ['No category keywords found'] };
    return {
      value: top.key,
      confidence: Math.min(0.95, 0.4 + (top.score / (total + 1)) * 0.6),
      reasons: [`Matched ${top.matched.slice(0, 4).map((w) => `“${w.trim()}”`).join(', ')}`],
    };
  }

  sentiment(text: string): SentimentResult {
    const pos = hits(text, POSITIVE);
    const neg = hits(text, NEGATIVE);
    const urg = hits(text, URGENT);
    const score = Math.max(-1, Math.min(1, (pos.length - neg.length * 1.2 - urg.length * 0.8) / 3));
    const value: Sentiment = urg.length >= 1 && score < 0.2 ? 'Urgent' : score <= -0.25 ? 'Negative' : score >= 0.3 ? 'Positive' : 'Neutral';
    const reasons = [
      ...(urg.length ? [`Urgency: ${urg.slice(0, 3).map((w) => `“${w}”`).join(', ')}`] : []),
      ...(neg.length ? [`Negative: ${neg.slice(0, 3).map((w) => `“${w}”`).join(', ')}`] : []),
      ...(pos.length ? [`Positive: ${pos.slice(0, 3).map((w) => `“${w}”`).join(', ')}`] : []),
    ];
    return { value, score, confidence: Math.min(0.9, 0.5 + (pos.length + neg.length + urg.length) * 0.1), reasons: reasons.length ? reasons : ['Plain, factual wording'] };
  }

  private similar(text: string, customerId: string | null, corpus: readonly Ticket[], excludeId: string | null, openOnly: boolean): SimilarTicket[] {
    const mine = tokens(text);
    return corpus
      .filter((t) => t.id !== excludeId && (!openOnly || !['resolved', 'closed'].includes(STATUS_META[t.status].group)))
      .map((t) => ({ ticket: t, score: Math.min(1, jaccard(mine, tokens(`${t.subject} ${t.description}`)) + (customerId && t.customerId === customerId ? 0.08 : 0)) }))
      .filter((s) => s.score >= 0.18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }

  private articles(text: string, kb: readonly KbArticle[], category?: TicketCategory): KbArticle[] {
    const mine = new Set(tokens(text));
    return kb
      .map((a) => ({ a, s: a.keywords.filter((k) => mine.has(k) || text.toLowerCase().includes(k)).length + (a.category === category ? 0.5 : 0) }))
      .filter((x) => x.s >= 1.5)
      .sort((x, y) => y.s - x.s)
      .slice(0, 3)
      .map((x) => x.a);
  }

  private assignees(ticket: Ticket, category: TicketCategory, lookups: TicketLookups, corpus: readonly Ticket[]): AssigneeSuggestion[] {
    const open = (id: string) => corpus.filter((t) => t.assigneeId === id && !['resolved', 'closed'].includes(STATUS_META[t.status].group)).length;
    return lookups.agents
      .filter((a) => a.role !== 'Admin')
      .map((a) => {
        const load = open(a.id);
        const reasons: string[] = [];
        let score = 0;
        if (a.skills.includes(category)) { score += 3; reasons.push(`Handles ${category}`); }
        if (a.teamId === ticket.teamId) { score += 1; reasons.push('Same team'); }
        const free = Math.max(0, a.capacity - load);
        score += (free / a.capacity) * 3;
        reasons.push(`${load} open of ${a.capacity}`);
        if (!a.available) { score -= 10; reasons.push('Unavailable'); }
        return { agent: a, score, openTickets: load, reasons };
      })
      .filter((s) => s.agent.available)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3);
  }

  insights(bundle: TicketBundle, lookups: TicketLookups): Observable<TicketInsights> {
    const t = bundle.ticket;
    const customer = lookups.customers.find((c) => c.id === t.customerId);
    const customerText = bundle.comments.filter((c) => !c.fromStaff).map((c) => c.body).join(' ');
    const text = `${t.subject}. ${t.description} ${customerText}`;
    return forkJoin([this.corpus$, this.kb$]).pipe(
      switchMap(([corpus, kb]) => {
        const sentiment = this.sentiment(customerText || text);
        const priority = this.priority(text, customer?.tier, sentiment.value);
        const category = this.category(text);
        const duplicates = this.similar(`${t.subject} ${t.description}`, t.customerId, corpus, t.id, true);
        const solved = this.similar(`${t.subject} ${t.description}`, null, corpus, t.id, false)
          .filter((s) => ['resolved', 'closed'].includes(STATUS_META[s.ticket.status].group))
          .slice(0, 2);
        const articles = this.articles(text, kb, category.value);
        const resolutions$ = solved.length
          ? forkJoin(solved.map((s) => this.api.get(s.ticket.id).pipe(catchError(() => of(null)))))
          : of([] as (TicketBundle | null)[]);
        return resolutions$.pipe(map((bundles) => {
          const fromTickets = bundles
            .filter((b): b is TicketBundle => !!b)
            .map((b) => ({
              id: b.ticket.id, number: b.ticket.number, subject: b.ticket.subject,
              resolution: b.comments.find((c) => c.body.startsWith('Resolved:'))?.body.replace(/^Resolved:\s*/, '') ?? 'Resolved without notes.',
            }));
          const steps = [
            ...fromTickets.slice(0, 2).map((f) => `As on ${f.number}: ${f.resolution}`),
            ...articles.slice(0, 2).map((a) => `${a.title}: ${a.summary}`),
          ];
          const lastCustomer = [...bundle.comments].reverse().find((c) => !c.fromStaff);
          const lastStaff = [...bundle.comments].reverse().find((c) => c.fromStaff && c.visibility === 'public');
          const firstSentence = t.description.split(/(?<=[.!?])\s/)[0];
          const summary: AiSummary = {
            headline: `${customer?.name ?? 'The customer'}${customer ? ` (${customer.organisation})` : ''} reports: ${firstSentence}`,
            bullets: [
              `${t.status} for ${relativeTime(t.createdAt).replace(' ago', '')}, ${t.priority.toLowerCase()} priority, ${bundle.comments.length} message${bundle.comments.length === 1 ? '' : 's'}`,
              lastStaff ? `Last staff reply ${relativeTime(lastStaff.createdAt)}: “${lastStaff.body.slice(0, 110)}${lastStaff.body.length > 110 ? '…' : ''}”` : 'No public reply from staff yet',
              ...(lastCustomer && lastCustomer.createdAt !== t.createdAt ? [`Customer last wrote ${relativeTime(lastCustomer.createdAt)}: “${lastCustomer.body.slice(0, 110)}”`] : []),
              ...(t.reopenCount ? [`Reopened ${t.reopenCount}×, so the earlier fix did not hold`] : []),
              ...(duplicates.length ? [`${duplicates.length} similar open ticket${duplicates.length === 1 ? '' : 's'} (possible duplicate)`] : []),
            ],
            nextStep: !t.assigneeId ? 'Assign an owner.'
              : !t.firstResponseAt ? 'Send a first reply to the customer.'
                : t.status === 'Pending Customer' ? 'Wait for the customer, or follow up if it has been more than a day.'
                  : steps.length ? 'Try the suggested resolution below, then resolve.' : 'Investigate and update the customer.',
            source: 'rules',
          };
          return {
            summary, priority, category, sentiment, duplicates,
            assignees: this.assignees(t, category.value, lookups, corpus),
            resolution: { steps, fromTickets, articles },
            articles,
            source: 'rules' as const,
          };
        }));
      }),
    );
  }

  draftInsights(subject: string, description: string, customerId: string | null, lookups: TicketLookups): Observable<DraftInsights> {
    const text = `${subject}. ${description}`;
    const tier = lookups.customers.find((c) => c.id === customerId)?.tier;
    return forkJoin([this.corpus$, this.kb$]).pipe(map(([corpus, kb]) => {
      const sentiment = this.sentiment(text);
      const category = this.category(text);
      return {
        sentiment,
        category,
        priority: this.priority(text, tier, sentiment.value),
        duplicates: subject.trim().length >= 6 ? this.similar(text, customerId, corpus, null, true) : [],
        articles: this.articles(text, kb, category.value),
      };
    }));
  }

  smartReply(bundle: TicketBundle, lookups: TicketLookups, agentName: string, tone: 'friendly' | 'formal' | 'brief'): Observable<string> {
    return this.insights(bundle, lookups).pipe(map((ins) => {
      const t = bundle.ticket;
      const customer = lookups.customers.find((c) => c.id === t.customerId);
      const first = customer?.name.split(' ')[0] ?? 'there';
      const greet = tone === 'formal' ? `Dear ${customer?.name ?? 'Customer'},` : `Hi ${first},`;
      const empathy = ins.sentiment.value === 'Urgent' ? 'I understand this is time-sensitive, so I have prioritised it.'
        : ins.sentiment.value === 'Negative' ? 'I am sorry for the trouble this has caused.'
          : 'Thanks for getting in touch.';
      const step = ins.resolution.fromTickets[0]?.resolution ?? ins.articles[0]?.summary;
      const action = step
        ? `Here is what we are doing: ${step}`
        : 'I am looking into this now and will update you as soon as I have more information.';
      const article = ins.articles[0] ? `\n\nThis guide may also help: “${ins.articles[0].title}”.` : '';
      const close = tone === 'formal' ? `\n\nKind regards,\n${agentName}\nOtoSolve Support` : `\n\nThanks,\n${agentName}`;
      if (tone === 'brief') return `${greet}\n\n${action}${close}`;
      return `${greet}\n\n${empathy} ${action}${article}${close}`;
    }));
  }
}

/* ---------------- gateway provider ---------------- */

@Injectable()
export class GatewayAiProvider extends AiProvider {
  private readonly http = inject(HttpClient);
  private readonly base = TICKETS_CONFIG.aiBaseUrl;

  insights(bundle: TicketBundle): Observable<TicketInsights> {
    return this.http.post<{ data: TicketInsights }>(`${this.base}/${encodeURIComponent(bundle.ticket.id)}/insights`, { version: bundle.ticket.version }).pipe(map((r) => r.data));
  }
  draftInsights(subject: string, description: string, customerId: string | null): Observable<DraftInsights> {
    return this.http.post<{ data: DraftInsights }>(`${this.base}/draft-insights`, { subject, description, customerId }).pipe(map((r) => r.data));
  }
  smartReply(bundle: TicketBundle, _l: TicketLookups, _agent: string, tone: 'friendly' | 'formal' | 'brief'): Observable<string> {
    return this.http.post<{ data: { body: string } }>(`${this.base}/${encodeURIComponent(bundle.ticket.id)}/reply`, { tone, version: bundle.ticket.version }).pipe(map((r) => r.data.body));
  }
}

/** Caches insights per ticket version, so revisiting a ticket does not re-run the analysis. */
@Injectable()
export class AiService {
  private readonly provider = inject(AiProvider);
  private readonly cache = new Map<string, Observable<TicketInsights>>();
  readonly source: AiSource = TICKETS_CONFIG.useMockApi ? 'rules' : 'model';

  insights(bundle: TicketBundle, lookups: TicketLookups): Observable<TicketInsights> {
    const key = `${bundle.ticket.id}:${bundle.ticket.version}:${bundle.comments.length}`;
    let hit = this.cache.get(key);
    if (!hit) {
      if (this.cache.size > 40) this.cache.clear();
      hit = this.provider.insights(bundle, lookups).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.cache.set(key, hit);
    }
    return hit;
  }

  draftInsights(subject: string, description: string, customerId: string | null, lookups: TicketLookups): Observable<DraftInsights> {
    return this.provider.draftInsights(subject, description, customerId, lookups);
  }

  smartReply(bundle: TicketBundle, lookups: TicketLookups, agentName: string, tone: 'friendly' | 'formal' | 'brief' = 'friendly'): Observable<string> {
    return this.provider.smartReply(bundle, lookups, agentName, tone);
  }
}
