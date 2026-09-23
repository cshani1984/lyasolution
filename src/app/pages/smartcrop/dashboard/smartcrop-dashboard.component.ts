import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { CropSaveResult, SmartcropPhoto } from '../../../core/models/smartcrop.model';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../core/services/smartcrop-auth.service';
import { SmartcropPhotosService } from '../../../core/services/smartcrop-photos.service';
import { SmartcropApiService } from '../../../core/services/smartcrop-api.service';
import { SmartcropCropModalComponent } from '../components/crop-modal/crop-modal.component';
import { SmartcropPhoneVerificationModalComponent } from '../components/phone-verification-modal/phone-verification-modal.component';
import { FooterComponent } from '../../../layout/footer/footer.component';

@Component({
  selector: 'app-smartcrop-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, SmartcropCropModalComponent, SmartcropPhoneVerificationModalComponent, FooterComponent],
  templateUrl: './smartcrop-dashboard.component.html',
  styleUrl: './smartcrop-dashboard.component.scss',
})
export class SmartcropDashboardComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  readonly photosService = inject(SmartcropPhotosService);
  readonly api = inject(SmartcropApiService);
  private readonly router = inject(Router);

  readonly activeId = signal<string | null>(null);
  readonly showOriginal = signal(false);
  readonly cropOpen = signal(false);
  readonly showPhoneModal = signal(false);
  readonly busy = signal(false);
  readonly toast = signal<string | null>(null);

  readonly photos = computed(() => this.photosService.photos());

  readonly activePhoto = computed(() => {
    const id = this.activeId();
    const list = this.photos();
    return list.find((p) => p.id === id) ?? list[0] ?? null;
  });

  readonly activeAspect = computed(() => {
    const photo = this.activePhoto();
    if (!photo) return 2 / 3;
    const size = this.photosService.sizes().find((s) => s.id === photo.size_id || s.name === photo.target_size_name);
    return size ? Number(size.aspect_ratio) : 2 / 3;
  });

  readonly pendingCount = computed(() => this.photos().filter((p) => p.status === 'pending').length);
  readonly approvedCount = computed(() => this.photos().filter((p) => p.status === 'approved').length);

  readonly previewUrl = computed(() => {
    const p = this.activePhoto();
    if (!p) return null;
    if (this.showOriginal()) return p.original_url;
    return p.cropped_url || p.original_url;
  });

  readonly userLabel = computed(() => {
    const p = this.auth.profile();
    return p?.full_name || p?.email || p?.phone || 'Studio';
  });

  readonly userInitials = computed(() => {
    const label = this.userLabel();
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return label.slice(0, 2).toUpperCase();
  });

  readonly whatsappBadge = computed(() =>
    this.api.isConfigured()
      ? this.i18n.t('smartcrop.studio.whatsappOn')
      : this.i18n.t('smartcrop.studio.whatsappDemo'),
  );

  readonly whatsappBadgeTitle = computed(() =>
    this.api.isConfigured()
      ? this.i18n.t('smartcrop.studio.whatsappOnHint')
      : this.i18n.t('smartcrop.studio.whatsappDemoHint'),
  );

  async ngOnInit(): Promise<void> {
    await this.photosService.refreshAll();
    const first = this.photos()[0];
    if (first) this.activeId.set(first.id);
    if (this.auth.needsPhone()) this.showPhoneModal.set(true);
  }

  selectPhoto(photo: SmartcropPhoto): void {
    this.activeId.set(photo.id);
    this.showOriginal.set(false);
  }

  toggleOriginal(): void {
    this.showOriginal.update((v) => !v);
  }

  selectSize(sizeId: string): void {
    const photo = this.activePhoto();
    const size = this.photosService.sizes().find((s) => s.id === sizeId);
    if (!photo || !size) return;
    void this.photosService.updatePhoto(photo.id, {
      size_id: size.id,
      target_size_name: size.name,
    });
  }

  openCrop(): void {
    if (this.activePhoto()) this.cropOpen.set(true);
  }

  async approveActive(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    this.busy.set(true);
    if (this.api.isConfigured()) {
      await this.api.batchUpdate({ photoIds: [photo.id], status: 'approved' });
    } else {
      await this.photosService.approvePhotos([photo.id]);
    }
    await this.photosService.loadPhotos();
    this.busy.set(false);
    this.toast.set(this.i18n.t('smartcrop.dash.approved'));
  }

  async approveAll(): Promise<void> {
    const ids = this.photos()
      .filter((p) => p.status === 'pending')
      .map((p) => p.id);
    if (!ids.length) return;
    this.busy.set(true);
    if (this.api.isConfigured()) {
      await this.api.batchUpdate({ photoIds: ids, status: 'approved' });
    } else {
      await this.photosService.approvePhotos(ids);
    }
    await this.photosService.loadPhotos();
    this.busy.set(false);
    this.toast.set(this.i18n.t('smartcrop.dash.approved'));
  }

  async onSimulateFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const phone = this.auth.profile()?.phone;
    if (!phone) {
      this.showPhoneModal.set(true);
      this.toast.set(this.i18n.t('smartcrop.dash.needPhone'));
      return;
    }

    this.busy.set(true);
    this.toast.set(null);

    if (this.api.isConfigured()) {
      const base64 = await this.fileToBase64(file);
      const res = await this.api.simulateWhatsApp({
        sender_phone: phone,
        media_base64: base64,
        caption_text: '10x15',
        user_id: this.auth.user()?.id,
      });
      this.busy.set(false);
      if (!res.ok) {
        this.toast.set(res.error ?? 'Upload failed');
        return;
      }
      await this.photosService.refreshAll();
    } else {
      const res = await this.photosService.simulateFromFile(file, phone);
      this.busy.set(false);
      if (res.error) {
        this.toast.set(res.error.message);
        return;
      }
    }

    const newest = this.photos()[0];
    if (newest) this.activeId.set(newest.id);
    this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
  }

  async saveCrop(result: CropSaveResult): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    this.busy.set(true);
    if (this.api.isConfigured()) {
      await this.api.processCrop({
        photoId: photo.id,
        cropData: result.cropData,
        sizeId: result.sizeId,
      });
    } else {
      await this.photosService.updatePhoto(photo.id, {
        crop_data: result.cropData,
        cropped_url: result.objectUrl ?? photo.cropped_url,
        size_id: result.sizeId ?? photo.size_id,
        target_size_name: result.sizeName ?? photo.target_size_name,
      });
    }
    await this.photosService.loadPhotos();
    this.cropOpen.set(false);
    this.busy.set(false);
  }

  async resetAiCrop(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo || !this.api.isConfigured()) return;
    this.busy.set(true);
    await this.api.processCrop({ photoId: photo.id, resetToAi: true });
    await this.photosService.loadPhotos();
    this.cropOpen.set(false);
    this.busy.set(false);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/smartcrop');
  }

  toggleLang(): void {
    this.i18n.toggleLang();
  }

  onPhoneVerified(): void {
    void this.photosService.refreshAll();
  }

  statusClass(status: string): string {
    if (status === 'approved' || status === 'printed') return 'is-ok';
    return 'is-warn';
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
