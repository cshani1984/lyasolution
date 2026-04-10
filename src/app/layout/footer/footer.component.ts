import { Component, inject } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import { LsLogoComponent } from '../../shared/ls-logo/ls-logo.component';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [LsLogoComponent],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  readonly i18n = inject(I18nService);
}
