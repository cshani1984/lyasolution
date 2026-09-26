import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { CropSaveResult, DetectedType, ShopCustomer, SmartcropPhoto } from '../../../core/models/smartcrop.model';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../core/services/smartcrop-auth.service';
import { SmartcropPhotosService } from '../../../core/services/smartcrop-photos.service';
import { SmartcropApiService } from '../../../core/services/smartcrop-api.service';
import { SmartcropCropModalComponent } from '../components/crop-modal/crop-modal.component';
import { SmartcropPhoneVerificationModalComponent } from '../components/phone-verification-modal/phone-verification-modal.component';
import { SmartcropBatchActionBarComponent } from '../components/batch-action-bar/batch-action-bar.component';
import { SmartcropFileUploaderComponent } from '../components/file-uploader/file-uploader.component';
import { SmartcropPhotoComparisonCardComponent } from '../components/photo-comparison-card/photo-comparison-card.component';
import { SmartcropStudioTutorialComponent } from '../components/studio-tutorial/studio-tutorial.component';
import { SmartcropQuotaExceededModalComponent } from '../components/quota-exceeded-modal/quota-exceeded-modal.component';
import { FooterComponent } from '../../../layout/footer/footer.component';
import { CROP_LOSS_WARN_PERCENT, confidenceTone } from '../../../core/smartcrop/crop-engine.math';
import { DEFAULT_SUPPORT_WA } from '../../../core/smartcrop/subscriptions';
import { smartCropFromUrl } from '../../../core/smartcrop/crop-engine.client';

const TUTORIAL_STORAGE_KEY = 'smartcrop-studio-tutorial-v1';

@Component({
  selector: 'app-smartcrop-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    SmartcropCropModalComponent,
    SmartcropPhoneVerificationModalComponent,
    SmartcropBatchActionBarComponent,
    SmartcropFileUploaderComponent,
    SmartcropPhotoComparisonCardComponent,
    SmartcropStudioTutorialComponent,
    SmartcropQuotaExceededModalComponent,
    FooterComponent,
  ],
  templateUrl: './smartcrop-dashboard.component.html',
  styleUrl: './smartcrop-dashboard.component.scss',
})
export class SmartcropDashboardComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  readonly photosService = inject(SmartcropPhotosService);
  readonly api = inject(SmartcropApiService);
  private readonly router = inject(Router);

  readonly cropLossWarn = CROP_LOSS_WARN_PERCENT;

  readonly activeId = signal<string | null>(null);
  readonly showOriginal = signal(false);
  readonly compareMode = signal(false);
  readonly cropOpen = signal(false);
  readonly showPhoneModal = signal(false);
  readonly showTutorial = signal(false);
  readonly showQuotaModal = signal(false);
  readonly quotaSupportUrl = signal(DEFAULT_SUPPORT_WA);
  readonly generativeBusy = signal(false);
  readonly busy = signal(false);
  readonly aiBusy = signal(false);
  readonly toast = signal<string | null>(null);
  readonly selectedIds = signal(new Set<string>());
  readonly uploadSizeName = signal('10x15');
  /** null = all customers */
  readonly activeCustomerPhone = signal<string | null>(null);

  readonly photos = computed(() => this.photosService.photos());

  /** CRM list: one row per end-customer phone under this shop. */
  readonly customers = computed((): ShopCustomer[] => {
    const map = new Map<string, ShopCustomer>();
    for (const p of this.photos()) {
      const phone = p.sender_phone || 'unknown';
      const row = map.get(phone) ?? {
        phone,
        full_name: p.customer_name ?? null,
        photo_count: 0,
        pending_count: 0,
        last_order_at: p.created_at,
      };
      row.photo_count += 1;
      if (p.status === 'pending') row.pending_count += 1;
      if (p.customer_name && !row.full_name) row.full_name = p.customer_name;
      if (!row.last_order_at || p.created_at > row.last_order_at) row.last_order_at = p.created_at;
      map.set(phone, row);
    }
    return [...map.values()].sort((a, b) =>
      String(b.last_order_at ?? '').localeCompare(String(a.last_order_at ?? '')),
    );
  });

  readonly filteredPhotos = computed(() => {
    const phone = this.activeCustomerPhone();
    const list = this.photos();
    if (!phone) return list;
    return list.filter((p) => p.sender_phone === phone);
  });

  readonly activePhoto = computed(() => {
    const id = this.activeId();
    const list = this.filteredPhotos();
    return list.find((p) => p.id === id) ?? list[0] ?? null;
  });

  readonly activeAspect = computed(() => {
    const photo = this.activePhoto();
    if (!photo) return 2 / 3;
    const size = this.photosService
      .sizes()
      .find((s) => s.id === photo.size_id || s.name === photo.target_size_name);
    return size ? Number(size.aspect_ratio) : 2 / 3;
  });

  readonly activeSizeLabel = computed(() => {
    const photo = this.activePhoto();
    if (!photo) return '';
    const size = this.photosService
      .sizes()
      .find((s) => s.id === photo.size_id || s.name === photo.target_size_name);
    if (!size) return photo.target_size_name;
    return `${size.name} (${size.width_cm}×${size.height_cm} cm)`;
  });

  readonly activeMetrics = computed(() => this.activePhoto()?.crop_data?.metrics ?? null);

  readonly confidenceClass = computed(() => {
    const m = this.activeMetrics();
    if (!m) return 'is-muted';
    return `is-${confidenceTone(m.confidenceScore)}`;
  });

  readonly cropLossWarnUi = computed(() => {
    const m = this.activeMetrics();
    if (!m) return false;
    return m.hasTruncationRisk || m.cropLossPercentage > CROP_LOSS_WARN_PERCENT;
  });

  readonly pendingCount = computed(() => this.filteredPhotos().filter((p) => p.status === 'pending').length);
  readonly approvedCount = computed(() =>
    this.filteredPhotos().filter((p) => p.status === 'approved' || p.status === 'printed').length,
  );
  readonly selectedCount = computed(() => this.selectedIds().size);

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
    const first = this.filteredPhotos()[0];
    if (first) this.activeId.set(first.id);
    if (this.auth.needsPhone()) this.showPhoneModal.set(true);
    else this.maybeOpenTutorial();
  }

  openTutorial(): void {
    this.showTutorial.set(true);
  }

  onTutorialClosed(): void {
    this.showTutorial.set(false);
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    } catch {
      /* private mode */
    }
  }

  private maybeOpenTutorial(): void {
    try {
      if (localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1') return;
    } catch {
      /* show anyway */
    }
    // Delay slightly so the studio paints first
    setTimeout(() => this.showTutorial.set(true), 450);
  }

  onPhoneVerified(): void {
    void this.photosService.refreshAll();
    this.maybeOpenTutorial();
  }

  selectCustomer(phone: string | null): void {
    this.activeCustomerPhone.set(phone);
    const first = this.filteredPhotos()[0];
    this.activeId.set(first?.id ?? null);
    this.compareMode.set(false);
    this.showOriginal.set(false);
  }

  selectPhoto(photo: SmartcropPhoto): void {
    this.activeId.set(photo.id);
    this.showOriginal.set(false);
    this.compareMode.set(true);
  }

  toggleSelect(photoId: string, event: Event): void {
    event.stopPropagation();
    const next = new Set(this.selectedIds());
    if (next.has(photoId)) next.delete(photoId);
    else next.add(photoId);
    this.selectedIds.set(next);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  toggleOriginal(): void {
    this.compareMode.set(false);
    this.showOriginal.update((v) => !v);
  }

  toggleCompare(): void {
    this.showOriginal.set(false);
    this.compareMode.update((v) => !v);
  }

  async selectSize(sizeId: string): Promise<void> {
    const photo = this.activePhoto();
    const size = this.photosService.sizes().find((s) => s.id === sizeId);
    if (!photo || !size) return;
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    if (this.api.isConfigured()) {
      await this.api.batchUpdate({ photoIds: [photo.id], sizeId: size.id });
      await this.photosService.loadPhotos();
    } else {
      await this.photosService.recropPhotoWithAi(photo, size);
    }
    this.busy.set(false);
    this.aiBusy.set(false);
    this.compareMode.set(true);
    this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
  }

  /** Notes: Size changed inside crop editor — update photo metadata immediately. */
  onModalSizeChanged(ev: { sizeId: string; sizeName: string }): void {
    const photo = this.activePhoto();
    if (!photo) return;
    this.photosService.photos.update((list) =>
      list.map((p) =>
        p.id === photo.id ? { ...p, size_id: ev.sizeId, target_size_name: ev.sizeName } : p,
      ),
    );
  }

  openCrop(): void {
    if (this.activePhoto()) this.cropOpen.set(true);
  }

  async approveActive(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    await this.sendToPrint([photo.id]);
  }

  async approveAll(): Promise<void> {
    const ids = this.filteredPhotos()
      .filter((p) => p.status === 'pending' || p.status === 'approved')
      .map((p) => p.id);
    if (!ids.length) return;
    await this.sendToPrint(ids);
  }

  async batchApprove(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    await this.sendToPrint(ids);
    this.clearSelection();
  }

  /** Notes: Approve + mark printed with hotfolder path for the lab. */
  private async sendToPrint(ids: string[]): Promise<void> {
    this.busy.set(true);
    try {
      if (this.api.isConfigured()) {
        const res = await this.api.sendToPrint(ids);
        await this.photosService.loadPhotos();
        const folder = res.hotfolderPaths?.[0];
        this.toast.set(
          folder
            ? this.i18n.t('smartcrop.dash.printedFolder').replace('{path}', folder)
            : this.i18n.t('smartcrop.dash.printed'),
        );
      } else {
        this.photosService.photos.update((list) =>
          list.map((p) =>
            ids.includes(p.id)
              ? {
                  ...p,
                  status: 'printed' as const,
                  hotfolder_path:
                    p.hotfolder_path ||
                    `C:\\Hotfolder\\${(p.customer_name || p.sender_phone).replace(/\s+/g, '_')}_${p.target_size_name}`,
                }
              : p,
          ),
        );
        const sample = this.photos().find((p) => ids.includes(p.id));
        this.toast.set(
          sample?.hotfolder_path
            ? this.i18n.t('smartcrop.dash.printedFolder').replace('{path}', sample.hotfolder_path)
            : this.i18n.t('smartcrop.dash.printed'),
        );
      }
      this.cropOpen.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async batchChangeSize(sizeId: string): Promise<void> {
    const size = this.photosService.sizes().find((s) => s.id === sizeId);
    const ids = [...this.selectedIds()];
    if (!size || !ids.length) return;
    this.busy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    if (this.api.isConfigured()) {
      await this.api.batchUpdate({ photoIds: ids, sizeId });
      await this.photosService.loadPhotos();
    } else {
      for (const id of ids) {
        const photo = this.photos().find((p) => p.id === id);
        if (photo) await this.photosService.recropPhotoWithAi(photo, size);
      }
    }
    this.busy.set(false);
    this.clearSelection();
    this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
  }

  async batchDelete(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    if (!confirm(this.i18n.t('smartcrop.dash.confirmDelete'))) return;
    this.busy.set(true);
    await this.photosService.deletePhotos(ids);
    this.busy.set(false);
    this.clearSelection();
    const first = this.photos()[0];
    this.activeId.set(first?.id ?? null);
  }

  async onSimulateFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.onUploadFiles({ files: [file], sizeName: this.uploadSizeName() });
  }

  async onUploadFiles(payload: { files: File[]; sizeName: string }): Promise<void> {
    if (!payload.files.length) return;

    if (!this.auth.user()) {
      this.toast.set(this.i18n.t('smartcrop.dash.needPhone'));
      return;
    }

    this.uploadSizeName.set(payload.sizeName || '10x15');
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));

    const phone = this.auth.profile()?.phone ?? '';
    let lastId: string | undefined;

    if (this.api.isConfigured() && phone) {
      const remote = await this.api.uploadPhotos({
        files: payload.files,
        sizeName: payload.sizeName,
        senderPhone: phone,
        userId: this.auth.user()?.id,
      });
      if (remote.ok) {
        await this.photosService.refreshAll();
        lastId = remote.photos?.[0]?.photoId;
      } else {
        for (const file of payload.files) {
          const local = await this.photosService.simulateFromFile(file, phone, payload.sizeName);
          if (local.error) {
            this.busy.set(false);
            this.aiBusy.set(false);
            this.toast.set(local.error.message);
            return;
          }
          lastId = local.photoId;
        }
      }
    } else {
      for (const file of payload.files) {
        const local = await this.photosService.simulateFromFile(file, phone, payload.sizeName);
        if (local.error) {
          this.busy.set(false);
          this.aiBusy.set(false);
          this.toast.set(local.error.message);
          return;
        }
        lastId = local.photoId;
      }
    }

    this.aiBusy.set(false);
    const newest = lastId
      ? this.photos().find((p) => p.id === lastId) ?? this.photos()[0]
      : this.photos()[0];
    if (newest) {
      this.activeId.set(newest.id);
      this.compareMode.set(true);
      this.showOriginal.set(false);
    }
    this.busy.set(false);
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
      await this.photosService.loadPhotos();
    } else {
      this.photosService.photos.update((list) =>
        list.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                crop_data: result.cropData,
                cropped_url: result.objectUrl ?? p.cropped_url,
                size_id: result.sizeId ?? p.size_id,
                target_size_name: result.sizeName ?? p.target_size_name,
              }
            : p,
        ),
      );
      if (!photo.original_url.startsWith('blob:')) {
        await this.photosService.updatePhoto(photo.id, {
          crop_data: result.cropData,
          cropped_url: result.objectUrl ?? photo.cropped_url,
          size_id: result.sizeId ?? photo.size_id,
          target_size_name: result.sizeName ?? photo.target_size_name,
        });
      }
    }
    this.cropOpen.set(false);
    this.busy.set(false);
  }

  async resetAiCrop(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    try {
      if (this.api.isConfigured()) {
        await this.api.processCrop({ photoId: photo.id, resetToAi: true });
        await this.photosService.loadPhotos();
      } else {
        const size =
          this.photosService.sizes().find((s) => s.id === photo.size_id || s.name === photo.target_size_name) ??
          this.photosService.sizes()[0];
        if (size) {
          await this.photosService.recropPhotoWithAi(photo, size);
        } else {
          const result = await smartCropFromUrl(photo.original_url, this.activeAspect());
          const url = URL.createObjectURL(result.blob);
          this.photosService.photos.update((list) =>
            list.map((p) =>
              p.id === photo.id ? { ...p, cropped_url: url, crop_data: result.cropData } : p,
            ),
          );
        }
      }
      this.compareMode.set(true);
      this.toast.set(this.i18n.t('smartcrop.crop.aiDone'));
    } catch (e) {
      this.toast.set(e instanceof Error ? e.message : 'AI crop failed');
    } finally {
      this.aiBusy.set(false);
      this.cropOpen.set(false);
      this.busy.set(false);
    }
  }

  async runGenerativeFill(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    if (!this.api.isConfigured()) {
      this.toast.set(this.i18n.t('smartcrop.generative.needApi'));
      return;
    }
    this.generativeBusy.set(true);
    this.busy.set(true);
    this.toast.set(this.i18n.t('smartcrop.generative.working'));
    try {
      const result = await this.api.generativeFill({
        photoId: photo.id,
        userId: this.auth.user()?.id,
        aspectRatio: this.activeAspect(),
      });
      if (result.quotaExceeded) {
        this.quotaSupportUrl.set(result.supportUrl || DEFAULT_SUPPORT_WA);
        this.showQuotaModal.set(true);
        this.toast.set(result.message || this.i18n.t('smartcrop.quota.title'));
        return;
      }
      if (!result.ok) {
        this.toast.set(result.error || 'Generative fill failed');
        return;
      }
      await this.photosService.loadPhotos();
      this.compareMode.set(true);
      this.toast.set(
        result.usedClipdrop
          ? this.i18n.t('smartcrop.generative.done')
          : this.i18n.t('smartcrop.generative.fallback'),
      );
    } catch (e) {
      this.toast.set(e instanceof Error ? e.message : 'Generative fill failed');
    } finally {
      this.generativeBusy.set(false);
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/smartcrop');
  }

  toggleLang(): void {
    this.i18n.toggleLang();
  }

  statusClass(status: string): string {
    if (status === 'approved' || status === 'printed') return 'is-ok';
    return 'is-warn';
  }

  isSizeSelected(size: { id: string; name: string }): boolean {
    const photo = this.activePhoto();
    if (!photo) return false;
    return photo.size_id === size.id || photo.target_size_name === size.name;
  }

  isActiveThumb(photo: SmartcropPhoto): boolean {
    return this.activePhoto()?.id === photo.id;
  }

  isSelected(photoId: string): boolean {
    return this.selectedIds().has(photoId);
  }

  detectionLabel(type: DetectedType | undefined): string {
    if (!type) return '';
    return this.i18n.t(`smartcrop.metrics.type.${type}`);
  }
}
