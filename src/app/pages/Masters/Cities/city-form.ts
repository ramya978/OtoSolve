import { Component } from '@angular/core';
import { FormValues } from '../../../Shared/Masters/masters.types';
import { MasterFormBase } from '../../../Shared/Masters/master-form.base';
import { MsSelect } from '../../../Shared/Masters/ms-select';
import { CITY } from './cities.config';
import { PageHeader } from '../../../Shared/layout/page-header/page-header';


@Component({
  selector: 'app-city-form',
  imports: [MsSelect,PageHeader],
  templateUrl: './city-form.html',
  styleUrls: ['../../../Shared/Masters/masters-shared.css', '../../../Shared/Masters/master-form.css', './city-form.css']
})
export class CityForm extends MasterFormBase {
    protected override readonly cfg = CITY;
 
  protected override readonly example: FormValues = { code: 'TRY', name: 'Tiruchirappalli', display: 'Tiruchirappalli (TRY)', country: 'IN', state: 'TN', metro: 'no', postal: '^62[0-9]{4}$', lat: '10.7905', lng: '78.7047', status: 'active', notes: '' };
 
  protected countryLabel(): string {
    const c = this.value('country');
    return c ? this.store.lookup.countryName(c) : '';
  }
 
  protected stateLabel(): string {
    const st = this.value('state');
    return st ? this.store.lookup.stateName(`${this.value('country')}|${st}`) : '';
  }
 
  protected position(): string {
    const lat = Number(this.value('lat'));
    const lng = Number(this.value('lng'));
    if (this.value('lat') === '' || this.value('lng') === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
  }
}