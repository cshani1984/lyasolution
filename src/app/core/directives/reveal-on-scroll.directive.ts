import { isPlatformBrowser } from '@angular/common';
import {
  Directive,
  ElementRef,
  HostBinding,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
} from '@angular/core';

/**
 * Reveals content on scroll via IntersectionObserver (no synchronous layout reads).
 * Hero sections should stay free of this directive so LCP is text/logo, not delayed paint.
 */
@Directive({
  selector: '[appRevealOnScroll]',
  standalone: true,
})
export class RevealOnScrollDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly platformId = inject(PLATFORM_ID);
  private observer?: IntersectionObserver;

  @HostBinding('class.is-visible') visible = false;

  ngOnInit(): void {
    this.renderer.addClass(this.el.nativeElement, 'reveal-item');

    if (!isPlatformBrowser(this.platformId)) {
      this.visible = true;
      return;
    }

    this.attachObserver();
  }

  private attachObserver(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            this.visible = true;
            this.observer?.unobserve(this.el.nativeElement);
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -6% 0px' },
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
