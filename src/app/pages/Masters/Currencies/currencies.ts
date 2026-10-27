import { Component } from '@angular/core';
import { MasterListBase } from '../../../Shared/Masters/master-list.base';
import { MsSelect } from '../../../Shared/Masters/ms-select';
import { CURRENCY } from './currencies.config';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';

/**
 * Currencies - list page (/app/masters/currency).
 * Search, filters, sorting, paging, row actions, view drawer and CSV export come from
 * MasterListBase; the table columns and filters are written out in currencies.html and
 * described in currencies.config.ts.
 */
@Component({
  selector: 'app-currencies',
  imports: [MsSelect,PageHeader],
  templateUrl: './currencies.html',
  styleUrls: ['../../../Shared/Masters/masters-shared.css', '../../../Shared/Masters/master-list.css', './currencies.css'],
  host: { '[style.--ml-metric-count]': 'metrics().length' }
})
export class Currencies extends MasterListBase {
  protected override readonly cfg = CURRENCY;
}
