import { Component, inject } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RevealOnScrollDirective],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  readonly i18n = inject(I18nService);

  readonly steps = [1, 2, 3, 4] as const;
}
