import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [RevealOnScrollDirective, NgOptimizedImage],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent {
  readonly i18n = inject(I18nService);
  readonly items = [1, 2, 3, 4, 5, 6, 7, 8] as const;

  projectImage(id: number): string {
    return `/images/projects/${id}.webp`;
  }
}
