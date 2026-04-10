import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, RevealOnScrollDirective],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly i18n = inject(I18nService);
  private readonly baseTestimonials = [1, 2, 3, 4, 5, 6];
  readonly testimonials = [...this.baseTestimonials, ...this.baseTestimonials];

  /** לוגואים שסופקו ללקוחות ומוצגים ב-section--clients */
  readonly clientLogos = [
    { file: 'site-point.png', name: 'Site Point' },
    
    { file: 'stringale.png', name: 'Stringale' },
    { file: 'collectapp.png', name: 'CollectApp' },
    { file: 'triggerhood.png', name: 'Triggerhood' },
    { file: 'apprival.png', name: 'Apprival' },
    { file: 'we-me.png', name: 'We-me' },
    { file: 'reinhold-cohn.png', name: 'Reinhold Cohn' },
    { file: 'eleven11_logo.svg', name: 'Eleven11' },
    { file: 'digitalmind.png', name: 'DigitalMind' },
    { file: 'ls-technology.png', name: 'LS Technology' },
    { file: 'presee.png', name: 'PreSee' },
    { file: 'e-s-d-meat.png', name: 'E.S.D Meat' },
    { file: 'produsity.png', name: 'Produsity' },
    { file: 'magnolia_logo.png', name: 'Magnolia' },
    { file: 'dynamic_infrastructure_logo.jpeg', name: 'Dynamic Infrastructure' },
    { file: 'laser_link_logo.png', name: 'Laser Link' },
  ] as const;

  /** Raster logos: prefer WebP in `<picture><source>`. */
  clientLogoWebp(file: string): string | null {
    if (file.endsWith('.svg')) return null;
    const m = file.match(/^(.*)\.(png|jpe?g)$/i);
    if (!m) return null;
    return `/images/clients/${m[1]}.webp`;
  }

  clientLogoFallback(file: string): string {
    return `/images/clients/${file}`;
  }
}
