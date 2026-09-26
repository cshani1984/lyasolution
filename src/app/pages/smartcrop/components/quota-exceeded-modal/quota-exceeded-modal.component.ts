import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { I18nService } from '../../../../core/services/i18n.service';
import { DEFAULT_SUPPORT_WA } from '../../../../core/smartcrop/subscriptions';

@Component({
  selector: 'app-smartcrop-quota-exceeded-modal',
  standalone: true,
  templateUrl: './quota-exceeded-modal.component.html',
  styleUrl: './quota-exceeded-modal.component.scss',
})
export class SmartcropQuotaExceededModalComponent {
  readonly i18n = inject(I18nService);

  @Input() open = false;
  @Input() supportUrl = DEFAULT_SUPPORT_WA;
  @Output() readonly closed = new EventEmitter<void>();
}
