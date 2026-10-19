/* LEAD CAPTURE - shared bits for the shell, the single-lead form and the bulk upload:
   route paths, icons and the option lists used by the custom dropdowns. */

/** One option of a custom dropdown. */
export interface LcOpt { value: string; label: string; hint?: string; }

/** Route paths (relative to the lead-capture parent route). */
export const LC_PATHS = {
  single: 'single',
  bulk: 'bulk',
  /** where "Open work queue" goes after a save */
  queue: '/app/fundraising/relationships/lead-work-queue',
} as const;

export const LC_ICONS: Record<string, string> = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6',
  sms: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  whatsapp: 'M3 21l1.6-4.7A8.5 8.5 0 1 1 7.8 19.6zM9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.5-2-1-1 1a4 4 0 0 1-2.5-2.5l1-1-1-2z',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  source: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  check: 'M20 6 9 17l-5-5',
  chev: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};

export const LANGUAGES: LcOpt[] = ['English (India)', 'Tamil', 'Hindi', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati']
  .map((v) => ({ value: v, label: v }));

export const COUNTRIES: LcOpt[] = ['India', 'Sri Lanka', 'Singapore', 'United Arab Emirates', 'United Kingdom', 'United States']
  .map((v) => ({ value: v, label: v }));

/** States (India only - other countries take free text later). */
export const STATES: LcOpt[] = ['Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Delhi', 'Telangana', 'West Bengal', 'Gujarat']
  .map((v) => ({ value: v, label: v }));

export const CITIES: Record<string, string[]> = {
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'],
  Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi'],
  Kerala: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
  Delhi: ['New Delhi', 'Dwarka', 'Rohini'],
  Telangana: ['Hyderabad', 'Warangal'],
  'West Bengal': ['Kolkata', 'Howrah', 'Siliguri'],
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara'],
};

export const SOURCES: LcOpt[] = [
  { value: 'Website', label: 'Website form' },
  { value: 'Event', label: 'Event or booth' },
  { value: 'Referral', label: 'Referral' },
  { value: 'QR poster', label: 'QR poster' },
  { value: 'Inbound call', label: 'Inbound call' },
  { value: 'WhatsApp', label: 'WhatsApp reply' },
  { value: 'CSR', label: 'CSR desk' },
];

export const CAMPAIGNS: LcOpt[] = [
  { value: 'HAI-DAYCARE-2026', label: 'Adopt a Day-Care Centre', hint: 'HAI-DAYCARE-2026' },
  { value: 'HAI-MOBILECARE-2026', label: 'Mobile Healthcare Units', hint: 'HAI-MOBILECARE-2026' },
  { value: 'HAI-WINTER-2026', label: 'Winter Relief - Warmth for Elders', hint: 'HAI-WINTER-2026' },
  { value: 'HAI-HELPLINE-2026', label: 'Elder Helpline - Keep the Line Open', hint: 'HAI-HELPLINE-2026' },
  { value: 'HAI-SIGHT-2026', label: 'Restore Sight - Cataract Surgeries', hint: 'HAI-SIGHT-2026' },
];

export const CONSENT_STATES: LcOpt[] = [
  { value: 'Granted', label: 'Granted', hint: 'Evidence needed' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Refused', label: 'Refused' },
  { value: 'Withdrawn', label: 'Withdrawn' },
];

export const CAPTURE_CHANNELS: LcOpt[] = ['In person', 'Phone call', 'Web form', 'Paper form', 'E-mail'].map((v) => ({ value: v, label: v }));

/** Contact channels for consent. */
export const CONTACT_CHANNELS = [
  { key: 'email', label: 'E-mail', icon: 'mail' },
  { key: 'sms', label: 'SMS', icon: 'sms' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
  { key: 'phone', label: 'Phone', icon: 'phone' },
] as const;

/** Bulk-upload template columns (also the CSV header). */
export const TEMPLATE_COLUMNS: { key: string; label: string; example: string; required: boolean }[] = [
  { key: 'first_name', label: 'First name', example: 'Anita', required: true },
  { key: 'last_name', label: 'Last name', example: 'Raman', required: true },
  { key: 'mobile', label: 'Mobile', example: '9876543210', required: true },
  { key: 'email', label: 'E-mail', example: 'anita.raman@example.com', required: false },
  { key: 'language', label: 'Preferred language', example: 'English (India)', required: false },
  { key: 'city', label: 'City', example: 'Chennai', required: false },
  { key: 'campaign', label: 'Campaign', example: 'HAI-DAYCARE-2026', required: false },
  { key: 'source', label: 'Source', example: 'Website', required: false },
  { key: 'notes', label: 'Notes', example: 'Met at the Chennai donor meet', required: false },
];
