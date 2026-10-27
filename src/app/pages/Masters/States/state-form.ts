import { Component } from '@angular/core';
import { FormValues } from '../../../Shared/Masters/masters.types';
import { MasterFormBase } from '../../../Shared/Masters/master-form.base';
import { MsSelect } from '../../../Shared/Masters/ms-select';
import { STATE } from './states.config';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

/**
 * New state / edit state - create page (/app/masters/state/new and /app/masters/state/:id/edit).
 * Values, rules, preview, dependent dropdowns and the action bar come from MasterFormBase;
 * every field is written out in state-form.html and its rules live in states.config.ts.
 */
@Component({
  selector: 'app-state-form',
  imports: [MsSelect,PageHeader],
  templateUrl: './state-form.html',
  styleUrls: ['../../../Shared/Masters/masters-shared.css', '../../../Shared/Masters/master-form.css', './state-form.css']
})
export class StateForm extends MasterFormBase {
  protected override readonly cfg = STATE;

  /** "Load example" values (fictional, valid against every rule). */
  protected override readonly example: FormValues = { code: 'AP', name: 'Andhra Pradesh', display: 'Andhra Pradesh (AP)', country: 'IN', jurisdiction: 'State', federal: 'no', postal: '^5[0-3][0-9]{4}$', addressFormat: 'Door No, Street, Area, City - PIN', gst: '37', taxCode: '', timezone: 'Asia/Kolkata', status: 'active', sort: '0', notes: '' };
}
