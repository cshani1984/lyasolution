import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';

@Component({
  selector: 'app-cv-builder',
  standalone: true,
  imports: [RouterLink, RevealOnScrollDirective],
  templateUrl: './cv-builder.component.html',
  styleUrl: './cv-builder.component.scss',
})
export class CvBuilderComponent {
  readonly i18n = inject(I18nService);
  readonly paths = [1, 2, 3] as const;
}
