import { Component, input } from '@angular/core';

export type LsLogoVariant = 'header' | 'footer';

@Component({
  selector: 'app-ls-logo',
  standalone: true,
  template: `
    <span class="ls-logo">
      <picture>
        <source type="image/webp" srcset="/logo-lya-solution.webp" />
        <img
          class="ls-logo__img"
          [class.ls-logo__img--footer]="variant() === 'footer'"
          src="/logo-lya-solution.png"
          alt="LYA SOLUTION"
          width="280"
          height="90"
          loading="eager"
          decoding="async"
          fetchpriority="high"
        />
      </picture>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      line-height: 0;
    }
    .ls-logo {
      display: inline-flex;
      align-items: center;
    }
    .ls-logo__img {
      display: block;
      width: auto;
      height: clamp(2.85rem, 6vw, 3.65rem);
      max-width: min(300px, 82vw);
      object-fit: contain;
      object-position: center;
    }
    .ls-logo__img--footer {
      height: clamp(3rem, 5.5vw, 4rem);
      max-width: min(300px, 90vw);
    }
  `,
})
export class LsLogoComponent {
  readonly variant = input<LsLogoVariant>('header');
}
