import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

export type Lang = 'he' | 'en';

const LANG_STORAGE_KEY = 'lya-lang';

/** Common IANA zones for Israel; used as a practical “in Israel” signal in the browser. */
const ISRAEL_TIMEZONES = new Set(['Asia/Jerusalem', 'Asia/Tel_Aviv']);

function readSavedLang(): Lang | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    if (v === 'he' || v === 'en') {
      return v;
    }
  } catch {
    /* private mode */
  }
  return null;
}

function persistLang(lang: Lang): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

function detectDefaultLangFromLocale(): Lang {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat === 'undefined') {
    return 'en';
  }
  try {
    const { timeZone, locale } = Intl.DateTimeFormat().resolvedOptions();
    if (timeZone && ISRAEL_TIMEZONES.has(timeZone)) {
      return 'he';
    }
    const lc = (locale || '').toLowerCase();
    if (lc.startsWith('he') || lc.startsWith('iw')) {
      return 'he';
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

function initialLang(platformId: object): Lang {
  if (!isPlatformBrowser(platformId)) {
    return 'en';
  }
  return readSavedLang() ?? detectDefaultLangFromLocale();
}

const DICT: Record<Lang, Record<string, string>> = {
  he: {
    'brand.name': 'LYA SOLUTION',
    'nav.home': 'בית',
    'nav.about': 'אודותינו',
    'nav.projects': 'פרויקטים',
    'nav.services': 'שירותים',
    'nav.contact': 'צור קשר',
    'lang.switch': 'HE / EN',

    'seo.title.home': 'LYA SOLUTION —בניית פתרונות דיגיטליים מתקדמים ומורכבים, בניית אתרים רספונסיבים, מערכות מורכבות ודשבורדים',
    'seo.desc.home':
      'פיתוח אתרים רספונסיביים, דפי נחיתה, מערכות מורכבות ודשבורדים מקצועיים ללא פשרות - שימוש בטכנולוגיות עדכניות וארכיטקטורה נכונה',
    'seo.title.about': 'אודות — LYA SOLUTION',
    'seo.desc.about':
      'בונים מערכות שעובדות בפרודקשן: מהתכנון ועד סקיילינג. הנדסת תוכנה, ארכיטקטורה ופתרונות דיגיטליים.',
    'seo.title.projects': 'תיק עבודות ופרויקטים — LYA SOLUTION',
    'seo.desc.projects':
      'דוגמאות לפרויקטים בשטח: דשבורדים, אתרים, מסחר, עברית (RTL) ומערכות קריטיות.',
    'seo.title.services': 'מה אנחנו עושים — LYA SOLUTION',
    'seo.desc.services':
      'פיתוח מקצה לקצה, ייעוץ ארכיטקטורה, חווית משתמש ועיצוב, וליווי צוותים — בפרודקשן.',
    'seo.title.contact': 'צור קשר — LYA SOLUTION',
    'seo.desc.contact':
      'בואו נבנה את הפרויקט הבא: ייעוץ, פיתוח והעלאה לפרודקשן. תל אביב ועבודה מרחוק.',

    'home.hero.badge': 'ארכיטקט Full Stack בכיר',
    'home.hero.title': ' בניית פתרונות',
    'home.hero.highlight': 'דיגיטליים מתקדמים',
    'home.hero.subtitle':
      'פיתוח אתרים רספונסיביים, דפי נחיתה, מערכות מורכבות ודשבורדים מקצועיים ללא פשרות - שימוש בטכנולוגיות עדכניות וארכיטקטורה נכונה',
    'home.hero.ctaPrimary': 'בואו נתחיל פרויקט',
    'home.hero.ctaSecondary': 'צפו בתיק עבודות',

    'home.services.title': 'מה אנחנו עושים',
    'home.services.1.title': 'מערכות אינטרנטיות ודשבורדים',
    'home.services.1.body':
      'בפיתוח מערכות אינטרנטיות, הדגש העיקרי הוא הנגשת המידע בצורה נוחה ויעילה על מנת להעניק למשתמשים חווית שימוש מיטבית.',
    'home.services.1.tags': 'REACT / NODE / AWS',
    'home.services.2.title': 'פיתוח אפליקציות',
    'home.services.2.body':
      'אנו מפתחים אפליקציות תוך שימוש בטכנולוגיות המתקדמות ביותר בשוק המאפשרות פיתוח בין פלטפורמות, המייעל את תהליך הפיתוח כולו ומקטין את עלויות הפיתוח.',
    'home.services.2.tags': 'פיתוח אפליקציות',
    'home.services.3.title': 'UI/UX',
    'home.services.3.body':
      'כחלק מתהליכי פיתוח של מוצרים דיגיטליים, אחד המרכיבים החשובים ביותר המשפיעים באופן ישיר על הצלחת המוצר הוא פיתוח ממשק ידידותי ועיצוב חוויית המשתמש ברמה הגבוהה ביותר.',
    'home.services.3.tags': 'PERFORMANCE / SRE',
    'home.services.4.title': 'אופטימיזציה וביצועים',
    'home.services.4.body':
      'שיפור זמני טעינת, חווית משתמש ושיפור ביצועים של מערכת באמצעות מדידות ואופטימיזציות.',
    'home.services.4.tags': 'אופטימיזציה וביצועים',
    'home.clients.title': 'חלק מהלקוחות והשותפים',
    'home.clients.brand.1': 'CloudScale',
    'home.clients.brand.2': 'DataForge',
    'home.clients.brand.3': 'PayStream',
    'home.clients.brand.4': 'Medlytx',
    'home.clients.brand.5': 'BuildGrid',
    'home.clients.brand.6': 'ShipFast',

    'home.testimonials.title': 'לקוחות ממליצים',
    'home.testimonials.1.name': 'סטרינגל',
    'home.testimonials.1.role': 'שדרוג אתר אינטרנט',
    'home.testimonials.1.quote':
      `חן מאוד נחמד, שירותי ומקצועי.
העבודה מתבצעת במהירות, ביעילות ובארגון.
אחרי שדיברנו עם כל מיני מתכנתים ששלחו הצעות מחיר לא קשורות,
וסיפרו "סיפורים יפים", אבל לא ממש התחילו את העבודה,
רק חן בדק ממש מה צריך לעשות והציע לטפל רק במה שלא יכולנו לעשות לבד -
כדי שלא נבזבז זמן וכסף מיותר.
בקיצור מומלץ.`,
    'home.testimonials.2.name': 'מגנוליה תכשיטי כסף בע"מ',
    'home.testimonials.2.role': 'ייעוץ לגבי אפליקציה',
    'home.testimonials.2.quote':
      'חן אדם בעל ידע מקצועי ויחסי אנוש מצוינים, מומלץ לעבוד מולו',
    'home.testimonials.3.name': 'PreSee',
    'home.testimonials.3.role': 'אתר',
    'home.testimonials.3.quote':
      'גם מקצועי גם זריז גם נחמד. שווה. הבין מהר את המשימה וגם את התמונה היותר רחבה.',
      'home.testimonials.4.name': 'מכללת הצאקרות',
      'home.testimonials.4.role': 'עדכון תוכנה והכנת דוחות',
      'home.testimonials.4.quote':
        'הציפיות שלי תאמו את התפוקה שקיבלתי ואפילו מעבר, איכות העבודה הייתה טובה מאוד, אני אבחן בחיוב לעבוד עם חן בפרויקטים עתידניים, אדם מוכשר ורציני',
        'home.testimonials.5.name': 'דיינאמיק אינפראסטראקצר',
        'home.testimonials.5.role': 'בנית אתר מעיצוב קיים',
        'home.testimonials.5.quote':
         `אנחנו חברת סטארטאפ ולצורך בניית פרויקט שלנו, חיפשנו מפתח עם ידע ויכולות גבוהות מעבר למה שנדרש כדי לבצע את המשימה. מישהו ושיכול לספק פיתרון מהיר, יעיל ואיכותי. מקצועית, חן ענה על כל הצפיות- בידע, ביכולת, עמידה בזמנים וגמישות לצרכים שלנו. הבונוס הגדול היה לגלות בן אדם שכיף לתקשר ולעבוד איתו!
אנחנו עדיין עובדים איתו ומקווים להמשיך בעתיד.`,
          'home.testimonials.6.name': 'LS TECHNOLOGY',
          'home.testimonials.6.role': 'בניית מערכת',
          'home.testimonials.6.quote':
            'חן היה מקצועי מהרגע הראשון ועמד בזמנים לאורך כל הפרויקט. בנוסף עם יחסי אנוש מעולים. ממשיכים לעבוד איתו בשוטף ובהחלט ממליצים בחום',
        'home.cta.title': 'מוכנים להפוך את הרעיון הבא שלכם למציאות?',
    'home.cta.sub':
      'בואו נבנה יחד מערכת שמחזיקה עומס, צוות ועתיד — לא רק MVP.',
    'home.cta.button': 'צרו קשר עכשיו',

    'footer.rights': 'כל הזכויות שמורות | LYA SOLUTION',
    'footer.year': '© 2026',
    'footer.twitter': 'TWITTER',
    'footer.linkedin': 'LINKEDIN',
    'footer.github': 'GITHUB',
    'footer.privacy': 'מדיניות פרטיות',

    'about.hero.kicker': 'אודות',
    'about.hero.title': 'פרופיל',
    'about.hero.subtitle':
     `אנו מתמחים בבניית מערכות שעובדות בפרודקשיין - לא רק קוד, אלא פתרונות. בניית מערכות קריטיות, משלב התכנון ועד לסקיילינג גלובלי. משלבים בין הנדסת תוכנה קפדנית לבין פתרונות יצירתיים המניעים עסקים קדימה.
     כחלק מהפיתוח משתמשים בכלי בינה מלאכותית (כגון Cursor, Claude code, Copilot) וכו' כדי לשיפור את מהירות הפיתוח ובדיקות הקוד`,

    'about.quote':
      'הקוד הוא לא רק פתרון, הוא שפה של יעילות',

    'about.story.title': 'הסיפור שלי',
    'about.story.body':
      'במהלך 15 השנים האחרונות, ראיתי טכנולוגיות באות והולכות. מה שלמדתי הוא שהיסודות נשארים זהים: הבנה עמוקה של צרכי המשתמש, ארכיטקטורה נקייה ויכולת להסתגל לשינויים. אני מאמין בכתיבת קוד שהוא לא רק עובד, אלא כזה שקל לתחזק, להבין ולהרחיב.',

    'about.process.title': 'איך אני עובד',
    'about.process.1.title': 'מבין את הביזנס',
    'about.process.1.body': 'מיפוי יעדים, סיכונים ומדדי הצלחה — לפני שורת קוד.',
    'about.process.2.title': 'מתכנן ארכיטקטורה',
    'about.process.2.body': 'גבולות מודולריים, חוזים, אבטחה ויכולת צמיחה.',
    'about.process.3.title': 'מפתח סקיילבילי',
    'about.process.3.body': 'קוד נקי, בדיקות, תצפית ותהליכי איכות.',
    'about.process.4.title': 'מעלה לפרודקשן',
    'about.process.4.body': 'השקה מבוקרת, ניטור, שיפור מתמשך — עם אחריות.',

    'projects.hero.kicker': 'פרויקטים',
    'projects.hero.title': 'תוצאות בשטח',
    'projects.hero.subtitle':
      'דוגמאות לפרויקטים עם דגש על קריטיות עסקית, ביצועים והמשכיות.',

    'projects.1.title': 'Apprival — דשבורד אנליטיקה',
    'projects.1.body':
      'ממשק ניהול וניתוח שימוש: דירוגים, KPIs ותרשימים — UX נקי לצוותי מוצר.',
    'projects.1.meta': 'Dashboard · Analytics · Web App',
    'projects.2.title': 'דף נחיתה',
    'projects.2.body':
      'נחיתת KPIs עם מיתוג חזק, טפסים ו-CTA — חוויית משתמש ממוקדת המרה.',
    'projects.2.meta': 'Landing · KPIs · UI',
    'projects.3.title': 'נשמה — פלטפורמת דיוקן דיגיטלי',
    'projects.3.body': 'אתר מותג בעברית (RTL) עם סיפור, הרשמה וחוויית משתמש רגישה.',
    'projects.3.meta': 'Hebrew · RTL · Product',
    'projects.4.title': 'Site Point — חבילות אחסון',
    'projects.4.body': 'תמחור, טאבים והשוואת חבילות Windows בענן — בניית אמון ושקיפות.',
    'projects.4.meta': 'Hosting · Pricing · Hebrew',
    'projects.6.title': 'White Fox Boutique — קולקציית בגדי ים',
    'projects.6.body': 'גלריית LOOKBOOK בגריד, גיבור כפול וחוויית מותג אופנה.',
    'projects.6.meta': 'E-commerce · Gallery · Retail',
    'projects.7.title': 'Oasis — קטלוג אופנה',
    'projects.7.body': 'פילטרים, מיון וגריד מוצרים — דגש על צילום ופריסה נקייה.',
    'projects.7.meta': 'Catalog · Filters · Commerce',
    'projects.5.title': 'Eleven — מערכת נומורולוגית',
    'projects.5.body':
      'פיצול 50/50: גיבור ויזואלי עם טקסט מעל תמונה, מול טופס התחברות בעברית (RTL) — שדות בצורת גלולה, reCAPTCHA ומיתוג סגול.',
    'projects.5.meta': 'Auth · RTL · UI',
    'projects.8.title': 'Chicagoland Air Duct',
    'projects.8.body': 'אתר שירות מקומי עם גיבור פוטוגני, CTA והנעה להזמנת שירות.',
    'projects.8.meta': 'Local SEO · Lead gen · WordPress',

    'services.hero.kicker': 'שירותים',
    'services.hero.title': 'מה אנחנו עושים',
    'services.hero.subtitle':
    'אנחנו בונים פתרונות דיגיטליים המשלבים ארכיטקטורת תוכנה מתקדמת עם חווית משתמש בלתי מתפשרת, המשלבת חדשנות טכנולוגית כדי להפוך את החזון שלך למציאות מוחשית. כמו כן נעזרים בסוכני AI להאיץ את תהליך ולשפר את תוצאות הפיתוח.',
    'services.title':'חלק משירותי הליבה',
     'services.1.title': 'פיתוח מקצה לקצה',
    'services.1.body':
      'פיתוח מקצה לקצה של מערכות מורכבות, אתרים רספונסיביים ודשבורדים. אנחנו מתמקדים בביצועים, אבטחה וחויית משתמש בכל פלטפורמה',
    'services.2.title': 'ייעוץ ארכיטקטורה',
    'services.2.body':
      'בחירת טכנולוגיות, מודל דאטה, אבטחה ותכנון עלויות — לפני שמתחייבים לכיוון.',  
    'services.3.title': 'עיצוב וחויית משתמש',
    'services.3.body':
      'עיצוב ממשקים שחורגים מהסטנדרט. הופכים עיצובים מורכבים לממשקים חיים, אינטראקטיביים ומדויקים פיקסל-פרפקט. ',
    'services.4.title': 'ליווי צוותים',
    'services.4.body':
      'קוד רוויו, מתודולוגיה והכשרה — כדי שהצוות ישמור על רמה גבוהה לאורך זמן.',

    'contact.hero.title1': 'בואו נבנה את',
    'contact.hero.title2': 'העתיד יחד',
    'contact.form.title': 'שלחו הודעה',
    'contact.form.firstName': 'שם פרטי',
    'contact.form.lastName': 'שם משפחה',
    'contact.form.phone': 'טלפון',
    'contact.form.email': 'אימייל',
    'contact.form.message': 'הודעה',
    'contact.form.placeholder.firstName': 'ישראל',
    'contact.form.placeholder.lastName': 'ישראלי',
    'contact.form.placeholder.phone': '050-1234567',
    'contact.form.phoneHint': '10–15 ספרות; מותרים מקף ורווח (למשל 050-1234567 או +972-50-1234567).',
    'contact.form.placeholder.email': 'israel@example.com',
    'contact.form.placeholder.message': 'ספרו לנו על הפרויקט...',
    'contact.form.submit': 'שליחת הודעה',
    'contact.form.submitting': 'שולחים…',
    'contact.form.success': 'ההודעה נשמרה. נחזור אליכם בקרוב.',
    'contact.form.error.submit': 'לא הצלחנו לשלוח כרגע. נסו שוב או כתבו במייל.',
    'contact.form.error.supabaseConfig':
      'שליחת הטופס לא פעילה: חסר מפתח Supabase (anon). הדביקו את המפתח בקובץ src/environments/environment.ts או הגדירו SUPABASE_ANON_KEY ב-Vercel.',
    'contact.form.error.required': 'שדה חובה',
    'contact.form.error.phone': 'מספר טלפון לא תקין',
    'contact.form.error.email': 'כתובת אימייל לא תקינה',
    'contact.form.error.minLength': 'נא להזין לפחות {n} תווים',

    'contact.location.mapAlt': 'מפת מיקום',
    'contact.map.hqPill': 'המשרד: רוטשילד 22',

    'contact.card.linkedin': 'LinkedIn',
    'contact.card.linkedin.val': 'linkedin.com/company/lyasolution',
    'contact.card.email': 'אימייל',
    'contact.card.email.val': 'lyasolutioninfo@gmail.com',
    'contact.bottom.body1':
      'אני מאמין בעבודה שמחברת בין איכות לבין צרכי העסק — בלי קיצורי דרך שמסכנים את המחר.',
      'contact.bottom.body2': 'בואו נהפוך את הרעיונות שלכם למציאות דיגיטלית. בין אם מדובר במוצר חדש או שדרוג מוצר קיים - אני כאן כדי לבנות את העתיד יחד',
  },
  en: {
    'brand.name': 'LYA SOLUTION',
    'nav.home': 'Home',
    'nav.about': 'About',
    'nav.projects': 'Projects',
    'nav.services': 'Services',
    'nav.contact': 'Contact',
    'lang.switch': 'HE / EN',

    'seo.title.home': 'LYA SOLUTION — Software, responsive website, dashboards, architecture & production systems',
    'seo.desc.home':
      'A technology partner for critical projects: architecture, performance, and taking solutions to production — complex systems at scale.',
    'seo.title.about': 'About — LYA SOLUTION',
    'seo.desc.about':
      'We build systems that work in production: from planning through scaling — software engineering, architecture, and digital solutions.',
    'seo.title.projects': 'Portfolio & case studies — LYA SOLUTION',
    'seo.desc.projects':
      'Examples of real-world projects: dashboards, websites, commerce, Hebrew (RTL), and critical systems.',
    'seo.title.services': 'Services — LYA SOLUTION',
    'seo.desc.services':
      'End-to-end development, architecture consulting, user experience and design, and team enablement — delivered in production.',
    'seo.title.contact': 'Contact — LYA SOLUTION',
    'seo.desc.contact':
      "Let's build your next project: consulting, development, and production deployment — Tel Aviv and remote.",

    'home.hero.badge': 'Senior Full Stack Architect',
    'home.hero.title': 'Building advanced',
    'home.hero.highlight': 'digital solutions',
    'home.hero.subtitle':
      'Responsive websites, landing pages, complex systems, and professional dashboards—without compromise—built with modern technologies and solid architecture.',
    'home.hero.ctaPrimary': "Let's start a project",
    'home.hero.ctaSecondary': 'View portfolio',

    'home.services.title': 'My services',
    'home.services.1.title': 'Full Stack development',
    'home.services.1.body':
      'End-to-end delivery with a focus on code quality, testing, and controlled rollout.',
    'home.services.1.tags': 'REACT / NODE / AWS',
    'home.services.2.title': 'Architecture & infrastructure',
    'home.services.2.body':
      'Modular design, security, and scalability — built to last.',
    'home.services.2.tags': 'INFRASTRUCTURE / SCALING',
    'home.services.3.title': 'Performance & reliability',
    'home.services.3.body':
      'Optimization, monitoring, and SRE practices when every second matters.',
    'home.services.3.tags': 'PERFORMANCE / SRE',
    'home.services.4.title': 'Optimization & performance',
    'home.services.4.body':
      'Faster loads, smoother UX, and sustainable performance through measurement, profiling, and targeted improvements.',
    'home.services.4.tags': 'WEB VITALS · PERF',

    'home.clients.title': 'Some of our clients and partners',
    'home.clients.brand.1': 'CloudScale',
    'home.clients.brand.2': 'DataForge',
    'home.clients.brand.3': 'PayStream',
    'home.clients.brand.4': 'Medlytx',
    'home.clients.brand.5': 'BuildGrid',
    'home.clients.brand.6': 'ShipFast',

    'home.testimonials.title': 'Client testimonials',
    'home.testimonials.1.name': 'Stringle',
    'home.testimonials.1.role': 'Website upgrade',
    'home.testimonials.1.quote':
      `Chen was very pleasant, helpful, and professional.
The work was done quickly, efficiently, and in an organized way.
After we spoke with various developers who sent unrelated quotes
and told nice stories but never really started the job,
only Chen actually checked what needed to be done and offered to handle only what we couldn’t do ourselves—
so we wouldn’t waste unnecessary time and money.
In short—highly recommended.`,
    'home.testimonials.2.name': 'Magnolia Silver Jewellery Ltd.',
    'home.testimonials.2.role': 'Application consulting',
    'home.testimonials.2.quote':
      'Chen has deep professional knowledge and excellent interpersonal skills—great to work with.',
    'home.testimonials.3.name': 'PreSee',
    'home.testimonials.3.role': 'Website',
    'home.testimonials.3.quote':
      'Professional, fast, and personable—worth it. He quickly understood both the task and the bigger picture.',
    'home.testimonials.4.name': 'The Hackers College',
    'home.testimonials.4.role': 'Software updates and report preparation',
    'home.testimonials.4.quote':
      'My expectations matched what I received—and then some. The quality of work was very good, and I view working with Chen on future projects positively: a talented, serious person.',
    'home.testimonials.5.name': 'Dynamic Infrastructure',
    'home.testimonials.5.role': 'Website build from an existing design',
    'home.testimonials.5.quote':
      `We’re a startup company, and for our project we were looking for a developer with knowledge and capabilities beyond what was required to get the job done—someone who could deliver a fast, efficient, and high-quality solution.
Professionally, Chen met every expectation—in expertise, capability, meeting deadlines, and flexibility to our needs. The big bonus was discovering someone who’s genuinely great to communicate and work with.
We’re still working with him and hope to continue in the future.`,
    'home.testimonials.6.name': 'LS Technology',
    'home.testimonials.6.role': 'System build',
    'home.testimonials.6.quote':
      'Chen was professional from day one and met deadlines throughout the project. He also has outstanding interpersonal skills. We continue to work with him on an ongoing basis and warmly recommend him.',

    'home.cta.title': 'Ready to turn your next idea into reality?',
    'home.cta.sub':
      'Let’s build a system that survives load, teams, and time — not just an MVP.',
    'home.cta.button': 'Contact me now',

    'footer.rights': 'All Rights Reserved | LYA SOLUTION ',
    'footer.year': '© 2026',
    'footer.twitter': 'TWITTER',
    'footer.linkedin': 'LINKEDIN',
    'footer.github': 'GITHUB',
    'footer.privacy': 'Privacy Policy',

    'about.hero.kicker': 'About',
    'about.hero.title': 'A strong profile for critical work',
    'about.hero.subtitle':
      `We build systems that actually run in production—not just code, but solutions. We deliver critical systems end to end, from planning through global scaling, combining rigorous software engineering with creative approaches that move businesses forward.
As part of how we build, we use AI tools (such as Cursor, Claude Code, Copilot, and more) to speed up development and strengthen code review.`,

    'about.quote': 'Code is not only a solution — it is a language of efficiency',

    'about.story.title': 'My story',
    'about.story.body':
      'Over the last 15 years, I’ve seen technologies come and go. What stays constant is fundamentals: deep understanding of user needs, clean architecture, and adaptability. I believe in code that not only works, but is maintainable, understandable, and extensible.',

    'about.process.title': 'How I work',
    'about.process.1.title': 'Understand the business',
    'about.process.1.body': 'Goals, risks, and success metrics — before a line of code.',
    'about.process.2.title': 'Design the architecture',
    'about.process.2.body': 'Modular boundaries, contracts, security, and growth paths.',
    'about.process.3.title': 'Build for scale',
    'about.process.3.body': 'Clean code, tests, observability, and quality gates.',
    'about.process.4.title': 'Ship to production',
    'about.process.4.body': 'Controlled launches, monitoring, iteration — with ownership.',

    'projects.hero.kicker': 'Projects',
    'projects.hero.title': 'Outcomes in production',
    'projects.hero.subtitle':
      'Examples focused on business-critical reliability, performance, and continuity.',

    'projects.1.title': 'Apprival — analytics dashboard',
    'projects.1.body':
      'Management and usage analytics UI: rankings, KPIs, and charts — a clean UX for product teams.',
    'projects.1.meta': 'Dashboard · Analytics · Web App',
    'projects.2.title': 'Leadership KPIs & growth metrics',
    'projects.2.body':
      'KPI landing with strong branding, forms, and CTAs — a conversion-focused user experience.',
    'projects.2.meta': 'Landing · KPIs · UI',
    'projects.3.title': 'Neshama — digital legacy platform',
    'projects.3.body':
      'Hebrew (RTL) brand site with storytelling, registration, and a careful, sensitive UX.',
    'projects.3.meta': 'Hebrew · RTL · Product',
    'projects.4.title': 'Site Point — hosting packages',
    'projects.4.body':
      'Pricing, tabs, and comparison of Windows cloud packages — built for trust and transparency.',
    'projects.4.meta': 'Hosting · Pricing · Hebrew',
    'projects.6.title': 'White Fox Boutique — swim collection',
    'projects.6.body':
      'LOOKBOOK gallery in a grid, dual hero, and a polished fashion brand experience.',
    'projects.6.meta': 'E-commerce · Gallery · Retail',
    'projects.7.title': 'Oasis — fashion catalog',
    'projects.7.body':
      'Filters, sorting, and a product grid — emphasis on photography and a clean layout.',
    'projects.7.meta': 'Catalog · Filters · Commerce',
    'projects.5.title': 'Eleven — numerical platform',
    'projects.5.body':
      '50/50 split: visual hero with text over imagery, alongside a Hebrew (RTL) sign-in form — pill-shaped fields, reCAPTCHA, and purple branding.',
    'projects.5.meta': 'Auth · RTL · UI',
    'projects.8.title': 'Chicagoland Air Duct',
    'projects.8.body':
      'Local service site with a photographic hero, CTAs, and clear prompts to book a service.',
    'projects.8.meta': 'Local SEO · Lead gen · WordPress',

    'services.hero.kicker': 'Services',
    'services.hero.title': 'What we do',
    'services.hero.subtitle':
      'We build digital solutions that combine advanced software architecture with an uncompromising user experience, applying technological innovation to turn your vision into tangible reality. We also use AI agents to accelerate the development process and improve outcomes.',
    'services.title':'Core services',
    'services.1.title': 'End-to-end development',
    'services.1.body':
      'End-to-end delivery for complex systems, responsive websites, and dashboards — with a focus on performance, security, and user experience on every platform.',
    'services.2.title': 'Architecture consulting',
    'services.2.body':
      'Technology choices, data modeling, security, and cost planning — before commitments harden.',
    'services.3.title': 'Design & user experience',
    'services.3.body':
      'Interface design that goes beyond the standard—turning complex designs into live, interactive, pixel-perfect experiences.',
    'services.4.title': 'Team enablement',
    'services.4.body':
      'Reviews, methodology, and training — so quality stays high over time.',

    'contact.hero.title1': "Let's Build the",
    'contact.hero.title2': 'Future Together',
    'contact.form.title': 'Send a message',
    'contact.form.firstName': 'First name',
    'contact.form.lastName': 'Last name',
    'contact.form.phone': 'Phone',
    'contact.form.email': 'Email address',
    'contact.form.message': 'Message',
    'contact.form.placeholder.firstName': 'John',
    'contact.form.placeholder.lastName': 'Doe',
    'contact.form.placeholder.phone': '+972 50-123-4567',
    'contact.form.phoneHint': '10–15 digits; spaces and dashes are OK (e.g. 050-1234567 or +972-50-1234567).',
    'contact.form.placeholder.email': 'john@example.com',
    'contact.form.placeholder.message': '…Tell us about your project',
    'contact.form.submit': 'Send message',
    'contact.form.submitting': 'Sending…',
    'contact.form.success': 'Your message was saved. We’ll get back to you shortly.',
    'contact.form.error.submit': 'Could not send right now. Please try again or email us.',
    'contact.form.error.supabaseConfig':
      'Form cannot send: Supabase anon key is missing. Add it in src/environments/environment.ts (dev) or set SUPABASE_ANON_KEY on Vercel (production).',
    'contact.form.error.required': 'This field is required',
    'contact.form.error.phone': 'Enter a valid phone number (9–15 digits).',
    'contact.form.error.email': 'Enter a valid email address',
    'contact.form.error.minLength': 'Enter at least {n} characters',

    'contact.location.title': 'Tel Aviv',
    'contact.location.sub': 'Tech District, Rothschild Blvd 22',
    'contact.location.mapAlt': 'Location map',
    'contact.map.hqPill': 'Our HQ: Rothschild 22',

    'contact.card.linkedin': 'LinkedIn',
    'contact.card.linkedin.val': 'linkedin.com/company/lyasolution',
    'contact.card.email': 'Email',
    'contact.card.email.val': 'lyasolutioninfo@gmail.com',
    'contact.bottom.body1':
      'Work that connects quality with business outcomes — without shortcuts that compromise tomorrow.',
      'contact.bottom.body2':
      "Let's turn your ideas into digital reality—whether it's a new product or improving an existing one. I'm here to build what's next, with you.",

  },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly lang = signal<Lang>(initialLang(this.platformId));

  readonly isRtl = computed(() => this.lang() === 'he');

  constructor() {
    effect(() => {
      const l = this.lang();
      document.documentElement.lang = l;
      document.documentElement.dir = l === 'he' ? 'rtl' : 'ltr';
    });
  }

  t(key: string): string {
    return DICT[this.lang()][key] ?? DICT.en[key] ?? key;
  }

  toggleLang(): void {
    this.lang.update((v) => {
      const next: Lang = v === 'he' ? 'en' : 'he';
      persistLang(next);
      return next;
    });
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
    persistLang(lang);
  }
}
