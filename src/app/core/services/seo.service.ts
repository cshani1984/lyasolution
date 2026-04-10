import { DestroyRef, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter, merge } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { resolveSiteOrigin } from '../config/site-origin';
import { I18nService } from './i18n.service';

type SeoPageId = 'home' | 'about' | 'projects' | 'services' | 'contact';

const PATH_TO_PAGE: { prefix: string; id: SeoPageId }[] = [
  { prefix: '/contact', id: 'contact' },
  { prefix: '/services', id: 'services' },
  { prefix: '/projects', id: 'projects' },
  { prefix: '/about', id: 'about' },
  { prefix: '', id: 'home' },
];

/** Default relative image for og:image & twitter:image (add a 1200×630 asset later if you want richer previews). */
const SOCIAL_IMAGE_PATH = '/favicon.png';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  constructor() {
    const destroyRef = inject(DestroyRef);

    merge(
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
      toObservable(this.i18n.lang),
    )
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.applyForUrl(this.router.url));

    this.applyForUrl(this.router.url);
  }

  private pageIdFromUrl(raw: string): SeoPageId {
    const path = raw.split('?')[0]?.split('#')[0] || '/';
    let normalized = path.replace(/\/+$/, '');
    if (normalized === '') {
      normalized = '/';
    }
    for (const { prefix, id } of PATH_TO_PAGE) {
      if (prefix === '' && (normalized === '/' || normalized === '')) {
        return id;
      }
      if (prefix !== '' && (normalized === prefix || normalized.startsWith(`${prefix}/`))) {
        return id;
      }
    }
    return 'home';
  }

  private absoluteUrl(path: string): string {
    const origin = resolveSiteOrigin();
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${origin}${p}`;
  }

  applyForUrl(routerUrl: string): void {
    const page = this.pageIdFromUrl(routerUrl);
    const title = this.i18n.t(`seo.title.${page}`);
    const description = this.i18n.t(`seo.desc.${page}`);
    const path = this.normalizePath(routerUrl);
    const url = this.absoluteUrl(path);
    const imageUrl = this.absoluteUrl(SOCIAL_IMAGE_PATH);
    const lang = this.i18n.lang();
    const ogLocale = lang === 'he' ? 'he_IL' : 'en_US';

    this.title.setTitle(title);

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large' });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: this.i18n.t('brand.name') });
    this.meta.updateTag({ property: 'og:locale', content: ogLocale });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: imageUrl });
    this.meta.updateTag({ property: 'og:image:alt', content: title });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: imageUrl });

    this.setCanonical(url);
    this.setJsonLd(url, description);
  }

  private normalizePath(routerUrl: string): string {
    const path = routerUrl.split('?')[0]?.split('#')[0] || '/';
    if (path === '' || path === '/') {
      return '/';
    }
    return path.replace(/\/+$/, '') || '/';
  }

  private setCanonical(href: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private setJsonLd(siteUrl: string, description: string): void {
    const org = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: this.i18n.t('brand.name'),
      url: resolveSiteOrigin(),
      description,
      email: 'lyasolutioninfo@gmail.com',
    };

    let script = this.document.getElementById('app-ld-org') as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = 'app-ld-org';
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(org);
  }
}
