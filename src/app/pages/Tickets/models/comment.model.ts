/** Public replies reach the requester; internal notes are visible to staff only. */
export type CommentVisibility = 'public' | 'internal';

export interface TicketComment {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly authorName: string;
  /** True when the author is staff (agent, manager, admin) rather than the requester. */
  readonly fromStaff: boolean;
  readonly body: string;
  readonly visibility: CommentVisibility;
  readonly mentions: readonly string[];
  readonly attachmentIds: readonly string[];
  readonly createdAt: string;
}

export interface NewComment {
  readonly body: string;
  readonly visibility: CommentVisibility;
  readonly mentions: readonly string[];
  readonly attachmentIds: readonly string[];
}
