import { Component } from '@angular/core';
import { FormValues } from '../../../Shared/Masters/masters.types';
import { MasterFormBase } from '../../../Shared/Masters/master-form.base';
import { TIME_ZONE } from './time-zones.config';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

/**
 * New time zone / edit time zone - create page (/app/masters/timezone/new and /app/masters/timezone/:id/edit).
 * Values, rules, preview, dependent dropdowns and the action bar come from MasterFormBase;
 * every field is written out in time-zone-form.html and its rules live in time-zones.config.ts.
 */
@Component({
  selector: 'app-time-zone-form',
  imports: [PageHeader],
  templateUrl: './time-zone-form.html',
  styleUrls: ['../../../Shared/Masters/masters-shared.css', '../../../Shared/Masters/master-form.css', './time-zone-form.css']
})
export class TimeZoneForm extends MasterFormBase {
  protected override readonly cfg = TIME_ZONE;

  /** "Load example" values (fictional, valid against every rule). */
  protected override readonly example: FormValues = { zone: 'Asia/Dhaka', display: '(UTC+06:00) Bangladesh Time', short: 'BST', offset: '360', dst: 'no', dstNote: '', recommended: 'no', sort: '0', status: 'active', notes: '' };
}
