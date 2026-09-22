import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { CropSaveResult, SmartcropPhoto } from '../../../core/models/smartcrop.model';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../core/services/smartcrop-auth.service';
import { SmartcropPhotosService } from '../../../core/services/smartcrop-photos.service';
import { SmartcropApiService } from '../../../core/services/smartcrop-api.service';
import { SmartcropPhotoGridComponent } from '../components/photo-grid/photo-grid.component';
import { SmartcropBatchActionBarComponent } from '../components/batch-action-bar/batch-action-bar.component';
import { SmartcropCropModalComponent } from '../components/crop-modal/crop-modal.component';
import { SmartcropPhoneVerificationModalComponent } from '../components/phone-verification-modal/phone-verification-modal.component';

@Component({
  selector: 'app-smartcrop-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    SmartcropPhotoGridComponent,
    SmartcropBatchActionBarComponent,
    SmartcropCropModalComponent,
    SmartcropPhoneVerificationModalComponent,
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

  readonly selectedIds = signal(new Set<string>());
  readonly originalPreviewIds = signal(new Set<string>());
  readonly statusFilter = signal<'all' | 'pending' | 'approved' | 'printed'>('all');
  readonly sizeFilter = signal('all');
  readonly search = signal('');
  readonly editingPhoto = signal<SmartcropPhoto | null>(null);
  readonly showPhoneModal = signal(false);
  readonly busy = signal(false);
  readonly toast = signal<string | null>(null);

  readonly filteredPhotos = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const size = this.sizeFilter();
    return this.photosService.photos().filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (size !== 'all' && p.target_size_name !== size) return false;
      if (q && !`${p.target_size_name} ${p.sender_phone} ${p.status}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  });

  readonly orderBadge = computed(() => {
    const orders = this.photosService.orders();
    if (!orders.length) return this.i18n.t('smartcrop.dash.statusNone');
    return orders[0].status;
  });

  readonly editingAspect = computed(() => {
    const photo = this.editingPhoto();
    if (!photo) return 2 / 3;
    const size = this.photosService.sizes().find((s) => s.id === photo.size_id || s.name === photo.target_size_name);
    return size ? Number(size.aspect_ratio) : 2 / 3;
  });

  async ngOnInit(): Promise<void> {
    await this.photosService.refreshAll();
    if (this.auth.needsPhone()) {
      this.showPhoneModal.set(true);
    }
  }

  toggleSelect(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
  }

  selectAll(): void {
    this.selectedIds.set(new Set(this.filteredPhotos().map((p) => p.id)));
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  togglePreview(id: string): void {
    const next = new Set(this.originalPreviewIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.originalPreviewIds.set(next);
  }

  async deleteOne(photo: SmartcropPhoto): Promise<void> {
    if (!confirm(this.i18n.t('smartcrop.dash.confirmDelete'))) return;
    await this.photosService.deletePhoto(photo.id);
    this.clearSelection();
  }

  async approveAll(): Promise<void> {
    const ids = this.filteredPhotos()
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

  async batchApprove(): Promise<void> {
    const ids = [...this.selectedIds()];
    this.busy.set(true);
    if (this.api.isConfigured()) {
      await this.api.batchUpdate({ photoIds: ids, status: 'approved' });
    } else {
      await this.photosService.approvePhotos(ids);
    }
    await this.photosService.loadPhotos();
    this.clearSelection();
    this.busy.set(false);
  }

  async batchDelete(): Promise<void> {
    if (!confirm(this.i18n.t('smartcrop.dash.confirmDelete'))) return;
    await this.photosService.deletePhotos([...this.selectedIds()]);
    this.clearSelection();
  }

  async batchChangeSize(sizeId: string): Promise<void> {
    const ids = [...this.selectedIds()];
    this.busy.set(true);
    if (this.api.isConfigured()) {
      const res = await this.api.batchUpdate({ photoIds: ids, sizeId });
      if (!res.ok) this.toast.set(res.error ?? 'Error');
    }
    await this.photosService.loadPhotos();
    this.busy.set(false);
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
    if (!this.api.isConfigured()) {
      this.toast.set(this.i18n.t('smartcrop.dash.noApi'));
      return;
    }

    this.busy.set(true);
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
    this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
  }

  async saveCrop(result: CropSaveResult): Promise<void> {
    const photo = this.editingPhoto();
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
    this.editingPhoto.set(null);
    this.busy.set(false);
  }

  async resetAiCrop(): Promise<void> {
    const photo = this.editingPhoto();
    if (!photo || !this.api.isConfigured()) return;
    this.busy.set(true);
    await this.api.processCrop({ photoId: photo.id, resetToAi: true });
    await this.photosService.loadPhotos();
    this.editingPhoto.set(null);
    this.busy.set(false);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/smartcrop');
  }

  onPhoneVerified(): void {
    void this.photosService.refreshAll();
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
