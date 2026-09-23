import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { LsLogoComponent } from '../../shared/ls-logo/ls-logo.component';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [LsLogoComponent, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  readonly i18n = inject(I18nService);
}
