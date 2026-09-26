import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { CropMetrics, SmartcropPhoto } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';
import {
  CROP_LOSS_WARN_PERCENT,
  HEAD_TOP_PADDING_RATIO,
  confidenceTone,
  cropLossTone,
} from '../../../../core/smartcrop/crop-engine.math';
import { GENERATIVE_FILL_RECOMMEND_PERCENT } from '../../../../core/smartcrop/subscriptions';
import { blindCenterCropFromUrl } from '../../../../core/smartcrop/crop-engine.client';

@Component({
  selector: 'app-smartcrop-photo-comparison-card',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './photo-comparison-card.component.html',
  styleUrl: './photo-comparison-card.component.scss',
})
export class SmartcropPhotoComparisonCardComponent implements OnChanges, OnDestroy {
  readonly i18n = inject(I18nService);
  readonly cropLossWarn = CROP_LOSS_WARN_PERCENT;
  readonly generativeRecommend = GENERATIVE_FILL_RECOMMEND_PERCENT;

  @Input({ required: true }) photo!: SmartcropPhoto;
  @Input() aspectRatio = 2 / 3;
  @Input() sizeLabel = '';
  @Input() blindUrl: string | null = null;
  @Input() generativeBusy = false;
  /** MediaPipe / Sharp / generative fill running — show spinner on images. */
  @Input() processing = false;

  @Output() readonly edit = new EventEmitter<void>();
  @Output() readonly resetAi = new EventEmitter<void>();
  @Output() readonly approve = new EventEmitter<void>();
  @Output() readonly generativeFill = new EventEmitter<void>();

  readonly localBlindUrl = signal<string | null>(null);
  readonly blindBusy = signal(false);

  private ownedBlind: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['photo'] || changes['aspectRatio'] || changes['blindUrl']) {
      void this.ensureBlindPreview();
    }
  }

  ngOnDestroy(): void {
    this.revokeOwned();
  }

  metrics(): CropMetrics | null {
    return this.photo?.crop_data?.metrics ?? null;
  }

  confidenceClass(): string {
    const m = this.metrics();
    if (!m) return 'is-muted';
    return `is-${confidenceTone(m.confidenceScore)}`;
  }

  lossTone(): 'green' | 'yellow' | 'red' {
    return cropLossTone(this.metrics()?.cropLossPercentage ?? 0);
  }

  lossStatusText(): string {
    const n = Math.round(this.metrics()?.cropLossPercentage ?? 0);
    const tone = this.lossTone();
    const margin = this.metrics()?.safetyMarginPercentage ?? 5;
    if (tone === 'green') {
      return `🟢 ${this.i18n.t('smartcrop.loss.green').replace('5%', `${margin}%`)}`;
    }
    if (tone === 'yellow') return `🟡 ${this.i18n.t('smartcrop.loss.yellow')}`;
    return `🔴 ${this.i18n.t('smartcrop.loss.red').replace('{n}', String(n))}`;
  }

  photographerNote(): string {
    return this.metrics()?.photographerNote || this.lossStatusText();
  }

  /** High AI confidence + no truncation risk → shop can trust auto-print. */
  isPrintReady(): boolean {
    const m = this.metrics();
    if (!m) return false;
    return m.confidenceScore >= 90 && !m.hasTruncationRisk && m.cropLossPercentage <= CROP_LOSS_WARN_PERCENT;
  }

  lossDanger(): boolean {
    return this.lossTone() === 'red';
  }

  recommendGenerativeFill(): boolean {
    if (this.photo?.recommend_generative_fill) return true;
    if (this.photo?.generative_fill_url) return false;
    const m = this.metrics();
    if (m?.shouldRecommendGenerativeFill) return true;
    const loss = m?.cropLossPercentage ?? 0;
    return loss > GENERATIVE_FILL_RECOMMEND_PERCENT;
  }

  lossBadgeText(): string {
    const n = Math.round(this.metrics()?.cropLossPercentage ?? 0);
    return this.i18n.t('smartcrop.generative.lossBadge').replace('{n}', String(n));
  }

  headroomPercent(): number {
    return Math.round(HEAD_TOP_PADDING_RATIO * 100);
  }

  foreheadLossHint(): number {
    const m = this.metrics();
    const loss = m?.cropLossPercentage ?? 18;
    return Math.max(12, Math.min(28, Math.round(loss * 0.75)));
  }

  badWarnText(): string {
    return this.i18n.t('smartcrop.compare.badWarn').replace('{n}', String(this.foreheadLossHint()));
  }

  detectionLabel(): string {
    const type = this.metrics()?.detectedType;
    if (!type) return '';
    return this.i18n.t(`smartcrop.metrics.type.${type}`);
  }

  goodSafeText(): string {
    return this.i18n
      .t('smartcrop.compare.goodSafe')
      .replace('+15%', `+${this.headroomPercent()}%`)
      .replace('15%', `${this.headroomPercent()}%`);
  }

  resolvedBlindUrl(): string {
    return this.blindUrl || this.localBlindUrl() || this.photo.original_url;
  }

  private async ensureBlindPreview(): Promise<void> {
    if (this.blindUrl) {
      this.revokeOwned();
      this.localBlindUrl.set(null);
      return;
    }
    if (!this.photo?.original_url) return;
    this.blindBusy.set(true);
    try {
      const blob = await blindCenterCropFromUrl(this.photo.original_url, this.aspectRatio);
      this.revokeOwned();
      const url = URL.createObjectURL(blob);
      this.ownedBlind = url;
      this.localBlindUrl.set(url);
    } catch {
      this.localBlindUrl.set(null);
    } finally {
      this.blindBusy.set(false);
    }
  }

  private revokeOwned(): void {
    if (this.ownedBlind) {
      URL.revokeObjectURL(this.ownedBlind);
      this.ownedBlind = null;
    }
  }
}
