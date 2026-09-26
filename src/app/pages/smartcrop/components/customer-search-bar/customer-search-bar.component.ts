import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ShopCustomer } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-smartcrop-customer-search-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './customer-search-bar.component.html',
  styleUrl: './customer-search-bar.component.scss',
})
export class SmartcropCustomerSearchBarComponent implements OnChanges {
  readonly i18n = inject(I18nService);
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() customers: ShopCustomer[] = [];
  @Input() selectedPhone: string | null = null;
  @Input() totalPhotos = 0;

  @Output() readonly selected = new EventEmitter<string | null>();
  @Output() readonly queryChange = new EventEmitter<string>();

  readonly query = signal('');
  readonly open = signal(false);
  readonly matches = signal<ShopCustomer[]>([]);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['customers'] || changes['selectedPhone']) {
      this.refreshMatches(this.query());
    }
  }

  onQueryInput(value: string): void {
    this.query.set(value);
    this.queryChange.emit(value);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.refreshMatches(value);
      this.open.set(true);
    }, 180);
  }

  onFocus(): void {
    this.refreshMatches(this.query());
    this.open.set(true);
  }

  pickAll(): void {
    this.query.set('');
    this.queryChange.emit('');
    this.selected.emit(null);
    this.open.set(false);
  }

  pick(customer: ShopCustomer): void {
    this.query.set(customer.full_name || customer.phone);
    this.selected.emit(customer.phone);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  private refreshMatches(raw: string): void {
    const q = raw.trim().toLowerCase().replace(/\s+/g, '');
    let list = [...this.customers];
    if (q) {
      list = list.filter((c) => {
        const phone = (c.phone || '').toLowerCase().replace(/\D/g, '');
        const name = (c.full_name || '').toLowerCase();
        const qDigits = q.replace(/\D/g, '');
        return (
          name.includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (qDigits.length >= 3 && phone.includes(qDigits))
        );
      });
    }
    this.matches.set(list.slice(0, 10));
  }
}
