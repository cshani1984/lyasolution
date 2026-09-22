import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';
import { I18nService } from '../../core/services/i18n.service';
import { SmartcropAuthService } from '../../core/services/smartcrop-auth.service';

@Component({
  selector: 'app-smartcrop',
  standalone: true,
  imports: [RouterLink, RevealOnScrollDirective],
  templateUrl: './smartcrop.component.html',
  styleUrl: './smartcrop.component.scss',
})
export class SmartcropComponent {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  readonly features = [1, 2, 3] as const;

  readonly previewShots = [
    {
      src: '/assets/smartcrop-demo/portrait-family.jpg',
      size: '10x15',
      aspect: '2 / 3',
      titleKey: 'smartcrop.preview.shot1',
      altKey: 'smartcrop.preview.shot1',
    },
    {
      src: '/assets/smartcrop-demo/portrait-child.jpg',
      size: '13x18',
      aspect: '2 / 3',
      titleKey: 'smartcrop.preview.shot2',
      altKey: 'smartcrop.preview.shot2',
    },
    {
      src: '/assets/smartcrop-demo/couple.jpg',
      size: '20x30',
      aspect: '2 / 3',
      titleKey: 'smartcrop.preview.shot3',
      altKey: 'smartcrop.preview.shot3',
    },
    {
      src: '/assets/smartcrop-demo/pet.jpg',
      size: 'A4',
      aspect: '2 / 3',
      titleKey: 'smartcrop.preview.shot4',
      altKey: 'smartcrop.preview.shot4',
    },
  ] as const;
}
