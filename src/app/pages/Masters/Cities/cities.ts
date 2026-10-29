import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MasterListBase } from '../../../Shared/Masters/master-list.base';
import { MsSelect } from '../../../Shared/Masters/ms-select';
import { CITY } from './cities.config';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';
import { Loader } from '../../../Shared/layout/Loader/loader';

/**
 * Cities - list page (/app/masters/city).
 * Search, filters, sorting, paging, row actions, view drawer and CSV export come from
 * MasterListBase; the table columns and filters are written out in cities.html and
 * described in cities.config.ts.
 */
@Component({
  selector: 'app-cities',
  imports: [CommonModule, MsSelect,PageHeader, Loader],
  templateUrl: './cities.html',
  styleUrls: ['../../../Shared/Masters/masters-shared.css', '../../../Shared/Masters/master-list.css', './cities.css'],
  host: { '[style.--ml-metric-count]': 'metrics().length' }
})
export class Cities extends MasterListBase {
  protected override readonly cfg = CITY;
}
