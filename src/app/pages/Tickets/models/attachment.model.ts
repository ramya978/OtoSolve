export interface TicketAttachment {
  readonly id: string;
  readonly ticketId: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  /** Download address. Null when the file is not available (the demo API keeps files only in memory). */
  readonly url: string | null;
}

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Extensions the upload accepts. The server re-checks type and scans every file. */
export const ALLOWED_ATTACHMENT_EXTENSIONS: readonly string[] = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'csv', 'log', 'doc', 'docx', 'xls', 'xlsx', 'zip',
];

/** Why a file cannot be attached, or null when it can. */
export function attachmentProblem(file: { name: string; size: number }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return `${file.name}: .${ext || '?'} files can't be attached. Use ${ALLOWED_ATTACHMENT_EXTENSIONS.join(', ')}.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is 25 MB.`;
  }
  return null;
}
