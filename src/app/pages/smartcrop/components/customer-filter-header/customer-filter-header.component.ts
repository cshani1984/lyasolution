import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { ShopCustomer } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-smartcrop-customer-filter-header',
  standalone: true,
  imports: [],
  templateUrl: './customer-filter-header.component.html',
  styleUrl: './customer-filter-header.component.scss',
})
export class SmartcropCustomerFilterHeaderComponent {
  readonly i18n = inject(I18nService);

  @Input({ required: true }) customer!: ShopCustomer;
  @Output() readonly cleared = new EventEmitter<void>();

  telHref(): string {
    const digits = (this.customer.phone || '').replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : '#';
  }

  async copyPhone(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.customer.phone);
    } catch {
      /* ignore */
    }
  }
}
