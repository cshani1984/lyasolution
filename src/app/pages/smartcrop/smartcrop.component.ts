import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { I18nService } from '../../core/services/i18n.service';
import { SmartcropAuthService } from '../../core/services/smartcrop-auth.service';
import { SmartcropAuthModalComponent } from './auth/smartcrop-auth-modal.component';

@Component({
  selector: 'app-smartcrop',
  standalone: true,
  imports: [RouterLink, SmartcropAuthModalComponent],
  templateUrl: './smartcrop.component.html',
  styleUrl: './smartcrop.component.scss',
})
export class SmartcropComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loginOpen = signal(false);
  readonly authTab = signal<'login' | 'register'>('login');
  readonly navOpen = signal(false);

  readonly faqOpen = signal<number | null>(0);

  readonly faqs = [
    {
      q: 'איך SmartCrop מתחברת לוואטסאפ של החנות שלנו?',
      a: 'החיבור מתבצע דרך ה-WhatsApp Business Cloud API הרשמי של Meta. אפשר להשתמש במספר הקיים של המעבדה או במספר ייעודי להזמנות. החיבור לוקח כ-5 דקות.',
    },
    {
      q: 'מה קורה עם פרטיות התמונות של הלקוחות?',
      a: 'התמונות מעובדות בסביבה מאובטחת ומועברות אליכם כקובץ מוכן להדפסה. לאחר העיבוד הן נמחקות משרתי העיבוד תוך 24 שעות בהתאם לתקני GDPR.',
    },
    {
      q: 'האם המערכת דורשת התקנת תוכנה כבדה או ציוד מיוחד?',
      a: 'לא. SmartCrop פועלת בענן. אתם והלקוחות עובדים ישירות בוואטסאפ, והקבצים החתוכים זמינים בדפדפן או מועברים אוטומטית למחשב המעבדה.',
    },
    {
      q: 'מה קורה אם ה-AI לא בטוח בחיתוך של תמונה חריגה?',
      a: 'כשרמת הוודאות יורדת מ-95%, התמונה מסומנת בדשבורד עם תגית "דרוש מבט מהיר", או נשלחת ללקוח עם תצוגה מקדימה לאישור בווטסאפ.',
    },
  ] as const;

  readonly imgs = {
    chat: '/assets/smartcrop-demo/portrait-family.jpg',
    badCrop: '/assets/smartcrop-demo/portrait-child.jpg',
    goodCrop: '/assets/smartcrop-demo/portrait-family.jpg',
    family: '/assets/smartcrop-demo/couple.jpg',
    avi: '/assets/smartcrop-demo/city.jpg',
    meirav: '/assets/smartcrop-demo/pet.jpg',
  } as const;

  async ngOnInit(): Promise<void> {
    await this.auth.waitUntilReady();
    if (this.auth.isSignedIn()) {
      await this.router.navigateByUrl('/smartcrop/dashboard');
      return;
    }
    const q = this.route.snapshot.queryParamMap;
    if (q.get('login') === '1' || q.get('startGoogle') === '1' || q.get('error') || q.get('register') === '1') {
      this.authTab.set(q.get('register') === '1' ? 'register' : 'login');
      this.loginOpen.set(true);
    }
  }

  openLogin(): void {
    this.authTab.set('login');
    this.loginOpen.set(true);
    this.navOpen.set(false);
  }

  openRegister(): void {
    this.authTab.set('register');
    this.loginOpen.set(true);
    this.navOpen.set(false);
  }

  setLang(lang: 'he' | 'en'): void {
    this.i18n.setLang(lang);
  }

  toggleFaq(i: number): void {
    this.faqOpen.update((cur) => (cur === i ? null : i));
  }

  toggleNav(): void {
    this.navOpen.update((v) => !v);
  }

  scrollTo(id: string): void {
    this.navOpen.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
