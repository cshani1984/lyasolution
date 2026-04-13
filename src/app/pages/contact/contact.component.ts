import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContactSubmissionsService } from '../../core/services/contact-submissions.service';
import { LeadWhatsAppNotifyService } from '../../core/services/lead-whatsapp-notify.service';
import { contactPhoneValidator } from '../../core/validators/phone.validator';
import { I18nService } from '../../core/services/i18n.service';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';

/** Rothschild Blvd 22, Tel Aviv — map pin */
const MAP_CENTER: [number, number] = [32.0637, 34.7759];
const MAP_ZOOM = 15;

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, RevealOnScrollDirective],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  readonly i18n = inject(I18nService);
  private readonly submissions = inject(ContactSubmissionsService);
  private readonly leadWhatsApp = inject(LeadWhatsAppNotifyService);

  private readonly mapContainer = viewChild<ElementRef<HTMLElement>>('mapEl');

  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  private map: import('leaflet').Map | undefined;

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, contactPhoneValidator()]],
    email: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const el = this.mapContainer()?.nativeElement;
    if (!el) return;

    void import('leaflet').then((Lmod) => {
      const L = (Lmod as { default?: typeof import('leaflet') }).default ?? (Lmod as typeof import('leaflet'));

      this.map = L.map(el, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: true,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      }).setView(MAP_CENTER, MAP_ZOOM);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(this.map);

      const markerIcon = L.divIcon({
        className: 'contact-map-marker',
        html: '<div class="contact-map-marker__dot" aria-hidden="true"></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      L.marker(MAP_CENTER, { icon: markerIcon }).addTo(this.map);

      queueMicrotask(() => this.map?.invalidateSize());
      setTimeout(() => this.map?.invalidateSize(), 250);
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = undefined;
  }

  showFieldError(controlName: string): boolean {
    const c = this.form.get(controlName);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  fieldError(controlName: string): string {
    const c = this.form.get(controlName);
    if (!c?.errors || !this.showFieldError(controlName)) return '';
    const e = c.errors;
    if (e['required']) {
      return this.i18n.t('contact.form.error.required');
    }
    if (e['email']) {
      return this.i18n.t('contact.form.error.email');
    }
    if (e['phone']) {
      return this.i18n.t('contact.form.error.phone');
    }
    if (e['minlength']) {
      const n = e['minlength'].requiredLength as number;
      return this.i18n.t('contact.form.error.minLength').replace('{n}', String(n));
    }
    return '';
  }

  onSubmit(): void {
    void this.handleSubmit();
  }

  private async handleSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitError.set(null);

    if (!this.submissions.isConfigured()) {
      this.submitError.set(this.i18n.t('contact.form.error.supabaseConfig'));
      return;
    }

    this.submitting.set(true);
    const v = this.form.getRawValue();

    const { error } = await this.submissions.save({
      firstName: v.firstName,
      lastName: v.lastName,
      phone: v.phone,
      email: v.email,
      message: v.message,
    });
    this.submitting.set(false);

    if (error) {
      this.submitError.set(this.i18n.t('contact.form.error.submit'));
      return;
    }

    await this.leadWhatsApp.notifyLeadChannels({
      firstName: v.firstName,
      lastName: v.lastName,
      phone: v.phone,
      email: v.email,
      message: v.message,
    });

    this.submitted.set(true);
    this.form.reset();
    Object.values(this.form.controls).forEach((ctrl) => ctrl.markAsUntouched());
  }
}
