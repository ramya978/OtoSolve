import { Component } from '@angular/core';
import { MasterListBase } from '../../../Shared/Masters/master-list.base';
import { MsSelect } from '../../../Shared/Masters/ms-select';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { COUNTRY } from './countries.config';

/**
 * Countries - list page (/app/masters/country).
 * Search, filters, sorting, paging, row actions, view drawer and CSV export come from
 * MasterListBase; the table columns and filters are written out in countries.html and
 * described in countries.config.ts.
 */
@Component({
  selector: 'app-countries',
  imports: [MsSelect, PageHeader],
  templateUrl: './countries.html',
  styleUrls: ['../../../Shared/Masters/masters-shared.css', '../../../Shared/Masters/master-list.css', './countries.css', '../../../Shared/layout/page-header/page-header.css'],
  host: { '[style.--ml-metric-count]': 'metrics().length' }
})
export class Countries extends MasterListBase {
  protected override readonly cfg = COUNTRY;
}
