/** URLs of the campaign workspace pages (match the menu routes in Shared/layout/menu.data.ts). */
export const CW_PATHS = {
  register: '/app/fundraising/campaigns/campaign-register',
  create: '/app/fundraising/campaigns/campaign-wizard',
  detail: '/app/fundraising/campaigns/campaign-detail',
  readiness: '/app/fundraising/campaigns/campaign-readiness-checklist',
  lifecycle: '/app/fundraising/campaigns/pause-resume-and-close-campaign',
  assets: '/app/fundraising/campaigns/tracking-asset-manager',
  assetNew: '/app/fundraising/campaigns/tracking-asset-manager/new',
  /** Full-page detail for one campaign: /app/fundraising/campaigns/campaign-detail/<CODE> */
  detailFor: (code: string) => `/app/fundraising/campaigns/campaign-detail/${code}`
} as const;
