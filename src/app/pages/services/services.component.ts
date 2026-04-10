import { Component, inject } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [RevealOnScrollDirective],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss',
})
export class ServicesComponent {
  readonly i18n = inject(I18nService);
  readonly items = [1, 2, 3, 4] as const;
}
