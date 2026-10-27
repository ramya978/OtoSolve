import { Component } from '@angular/core';
import { FormValues } from '../../../Shared/Masters/masters.types';
import { MasterFormBase } from '../../../Shared/Masters/master-form.base';
import { MsSelect } from '../../../Shared/Masters/ms-select';
import { CURRENCY } from './currencies.config';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

@Component({
  selector: 'app-currency-form',
  imports: [MsSelect,PageHeader],
  templateUrl: './currency-form.html',
  styleUrls: ['../../../Shared/Masters/masters-shared.css', '../../../Shared/Masters/master-form.css', './currency-form.css']
})
export class CurrencyForm extends MasterFormBase {
  protected override readonly cfg = CURRENCY;

  /** "Load example" values (fictional, valid against every rule). */
  protected override readonly example: FormValues = { code: 'NZD', name: 'New Zealand Dollar', numeric: '554', type: 'Fiat', symbol: 'NZ$', symbolPosition: 'prefix', displayFormat: 'NZ${amount}', decimals: '2', minor: 'Cent', rounding: 'Half up', step: '0.10', status: 'active', notes: '' };
}
