import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [],
  templateUrl: './loader.html',
  styleUrl: './loader.css',
  host: { class: 'ld-root' }
})
export class Loader {
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  readonly message = input<string>('');

  readonly fullPage = input<boolean>(false);
}