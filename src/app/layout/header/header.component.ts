import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { LsLogoComponent } from '../../shared/ls-logo/ls-logo.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LsLogoComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly i18n = inject(I18nService);
  readonly menuOpen = signal(false);

  readonly navLinks = computed(() => {
    this.i18n.lang();
    return [
      { path: '/', label: this.i18n.t('nav.home'), exact: true },
      { path: '/about', label: this.i18n.t('nav.about'), exact: false },
      { path: '/projects', label: this.i18n.t('nav.projects'), exact: false },
      { path: '/services', label: this.i18n.t('nav.services'), exact: false },
      { path: '/contact', label: this.i18n.t('nav.contact'), exact: false },
    ];
  });

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleLang(): void {
    this.i18n.toggleLang();
  }
}
