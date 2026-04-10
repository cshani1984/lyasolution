import {
  Directive,
  ElementRef,
  HostBinding,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';

/** Adds a scroll-based clip/scale effect to images. */
@Directive({
  selector: '[appImageReveal]',
  standalone: true,
})
export class ImageRevealDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  @HostBinding('class.img-reveal') cls = true;
  @HostBinding('class.img-reveal--visible') visible = false;

  ngOnInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            this.visible = true;
            this.observer?.unobserve(this.el.nativeElement);
          }
        }
      },
      { threshold: 0.2 }
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
