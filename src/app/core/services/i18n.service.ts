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
    'nav.cv': 'יצירת קורות חיים',
    'nav.smartcrop': 'SmartCrop',
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
    'seo.title.cv': 'יצירת קורות חיים — LYA SOLUTION',
    'seo.desc.cv':
      'בחרו מסלול: יצירה מאפס, שיפור עם AI, או התאמה למשרה — קורות חיים מקצועיים ומרשימים.',
    'seo.title.smartcrop': 'SmartCrop — LYA SOLUTION',
    'seo.desc.smartcrop':
      'ניהול הדפסות תמונות חכם: קליטה מ-WhatsApp, חיתוך אוטומטי לפי נקודת מוקד, ופורטל לקוח לאישור והתאמה.',
    'seo.title.smartcropLogin': 'התחברות ל-SmartCrop — LYA SOLUTION',
    'seo.desc.smartcropLogin': 'התחברו עם Google או טלפון כדי לסנכרן תמונות WhatsApp ולאשר הדפסות.',
    'seo.title.smartcropDash': 'לוח בקרת SmartCrop — LYA SOLUTION',
    'seo.desc.smartcropDash': 'צפו, ערכו ואשרו תמונות להדפסה עם חיתוך חכם.',

    'smartcrop.hero.title': 'הדפסות מדויקות בלי לחתוך ראשים',
    'smartcrop.hero.subtitle':
      'SmartCrop מקבל תמונות והוראות גודל מ-WhatsApp, ממרכז אוטומטית סביב הנקודה החשובה, ומאפשר ללקוחות לאשר ולכוון לפני ההדפסה.',
    'smartcrop.hero.cta': 'כניסה לפורטל',
    'smartcrop.hero.demo': 'גלריית הדגמה',
    'smartcrop.hero.openDash': 'ללוח הבקרה',
    'smartcrop.hero.contact': 'דברו איתנו',
    'smartcrop.demo.title': 'גלריית הדפסות לדוגמה',
    'smartcrop.demo.subtitle': 'צפו בתמונות עם גדלי הדפסה, החליפו גודל, וערכו חיתוך ידני תמונה אחר תמונה — בלי התחברות.',
    'smartcrop.demo.back': 'חזרה',
    'smartcrop.demo.hint': 'לחצו על עריכה (עט) כדי לכוון חיתוך. אחרי שמירה עוברים אוטומטית לתמונה הבאה.',
    'smartcrop.demo.cropSaved': 'החיתוך נשמר — ממשיכים לתמונה הבאה.',
    'smartcrop.demo.resetAi': 'חזר לחיתוך אוטומטי.',
    'smartcrop.demo.sizeChanged': 'הגודל עודכן ל-{size} והחיתוך חושב מחדש.',
    'smartcrop.feature.1.title': 'קליטה מ-WhatsApp',
    'smartcrop.feature.1.body': 'תמונות וגודל הדפסה מגיעים אוטומטית — כולל מצב הדגמה להעלאה מהפורטל.',
    'smartcrop.feature.2.title': 'חיתוך חכם',
    'smartcrop.feature.2.body': 'זיהוי נקודת מוקד עם מרווח עליון בטוח כדי להגן על ראשים ונושאים מרכזיים.',
    'smartcrop.feature.3.title': 'פורטל לקוח',
    'smartcrop.feature.3.body': 'תצוגת רשת, עריכת חיתוך, פעולות מרובות ואישור להדפסה — בעברית ובאנגלית.',
    'smartcrop.preview.title': 'כך זה נראה בהדפסה',
    'smartcrop.preview.subtitle': 'תמונות לדוגמה עם גדלי הדפסה שונים — לחצו על הגלריה כדי לכוון חיתוך ידנית.',
    'smartcrop.preview.cta': 'פתחו את גלריית ההדגמה',
    'smartcrop.preview.shot1': 'משפחה',
    'smartcrop.preview.shot2': 'ילדים',
    'smartcrop.preview.shot3': 'זוג',
    'smartcrop.preview.shot4': 'חיות מחמד',
    'smartcrop.login.back': 'חזרה',
    'smartcrop.login.title': 'התחברות ל-SmartCrop',
    'smartcrop.login.subtitle': 'סנכרנו את תמונות ה-WhatsApp שלכם עם חשבון הלקוח.',
    'smartcrop.login.google': 'המשך עם Google',
    'smartcrop.login.or': 'או',
    'smartcrop.login.sendOtp': 'שלחו קוד ב-SMS',
    'smartcrop.login.otp': 'קוד אימות',
    'smartcrop.login.verify': 'אימות והמשך',
    'smartcrop.login.continue': 'המשך ללוח הבקרה',
    'smartcrop.login.noSupabase': 'Supabase לא מוגדר בסביבה.',
    'smartcrop.phone.title': 'סנכרון מספר WhatsApp',
    'smartcrop.phone.body': 'הזינו את מספר הטלפון כדי לשייך תמונות שנשלחו ב-WhatsApp לחשבון שלכם.',
    'smartcrop.phone.label': 'מספר טלפון',
    'smartcrop.phone.placeholder': '+9725...',
    'smartcrop.phone.save': 'שמירה וסנכרון',
    'smartcrop.phone.later': 'מאוחר יותר',
    'smartcrop.phone.invalid': 'מספר טלפון לא תקין (פורמט E.164).',
    'smartcrop.dash.title': 'ההדפסות שלי',
    'smartcrop.dash.signOut': 'התנתקות',
    'smartcrop.dash.statusNone': 'אין הזמנה פעילה',
    'smartcrop.dash.search': 'חיפוש…',
    'smartcrop.dash.filterAll': 'כל הסטטוסים',
    'smartcrop.dash.sizeAll': 'כל הגדלים',
    'smartcrop.dash.selectAll': 'בחר הכל',
    'smartcrop.dash.simulate': 'סימולציית WhatsApp',
    'smartcrop.dash.approveAll': 'אשר הכל והדפס',
    'smartcrop.dash.loading': 'טוען תמונות…',
    'smartcrop.dash.empty': 'עדיין אין תמונות. שלחו תמונה ב-WhatsApp או השתמשו בסימולציה.',
    'smartcrop.dash.backLanding': 'חזרה ל-SmartCrop',
    'smartcrop.dash.confirmDelete': 'למחוק את התמונות שנבחרו?',
    'smartcrop.dash.approved': 'התמונות אושרו.',
    'smartcrop.dash.needPhone': 'נדרש מספר טלפון לפני סימולציה.',
    'smartcrop.dash.noApi': 'כתובת SmartCrop API לא מוגדרת.',
    'smartcrop.dash.simulated': 'התמונה נקלטה וחתוכה.',
    'smartcrop.card.original': 'מקור',
    'smartcrop.card.crop': 'חיתוך',
    'smartcrop.card.edit': 'עריכת חיתוך',
    'smartcrop.card.delete': 'מחיקה',
    'smartcrop.batch.selected': '{n} נבחרו',
    'smartcrop.batch.changeSize': 'שינוי גודל',
    'smartcrop.batch.pickSize': 'בחרו גודל',
    'smartcrop.batch.approve': 'אישור נבחרים',
    'smartcrop.batch.delete': 'מחיקת נבחרים',
    'smartcrop.batch.clear': 'ניקוי בחירה',
    'smartcrop.crop.title': 'עריכת חיתוך',
    'smartcrop.crop.printSize': 'גודל הדפסה',
    'smartcrop.crop.ratio': 'יחס גובה-רוחב',
    'smartcrop.crop.close': 'סגירה',
    'smartcrop.crop.zoom': 'זום',
    'smartcrop.crop.rotateLeft': 'סיבוב שמאלה',
    'smartcrop.crop.rotateRight': 'סיבוב ימינה',
    'smartcrop.crop.loadFailed': 'טעינת התמונה נכשלה.',
    'smartcrop.crop.resetAi': 'איפוס לחיתוך AI',
    'smartcrop.crop.save': 'שמירת חיתוך',

    'cv.hero.title': 'העתיד המקצועי שלך מתחיל כאן',
    'cv.hero.subtitle':
      'בחרו את המסלול המתאים לכם ליצירת קורות חיים מקצועיים, מדויקים ומרשימים בעזרת טכנולוגיית AI מתקדמת.',
    'cv.path.1.title': 'יצירה מאפס',
    'cv.path.1.body':
      'בנו את קורות החיים שלכם צעד אחר צעד עם ממשק אינטואיטיבי והנחיות מובנות לאורך כל הדרך.',
    'cv.path.1.cta': 'התחילו עכשיו',
    'cv.path.2.badge': 'פופולרי',
    'cv.path.2.title': 'שיפור עם AI',
    'cv.path.2.body':
      'העלו קובץ קיים והניחו לבינה המלאכותית שלנו לשדרג ניסוחים ועיצוב לרמה עולמית.',
    'cv.path.2.cta': 'העלו קובץ',
    'cv.path.3.title': 'התאמה למשרה',
    'cv.path.3.body':
      'הדביקו תיאור משרה ונתאים את קורות החיים שלכם בדיוק למה שמגייסים מחפשים.',
    'cv.path.3.cta': 'התאימו משרה',
    'cv.cta.title': 'מוכנים להגיע לשלב הבא?',
    'cv.cta.sub':
      'הצטרפו לאלפי מקצוענים שכבר משתמשים ב-LYA כדי להשיג את משרת החלומות שלהם.',
    'cv.cta.button': 'צרו קשר',

    'seo.title.cvBuilder': 'עורך קורות חיים — LYA SOLUTION',
    'seo.desc.cvBuilder': 'בנו קורות חיים שלב אחר שלב עם תצוגה מקדימה, AI וייבוא מקובץ PDF/DOCX.',
    'cv.edit.back': 'חזרה',
    'cv.edit.saved': 'כל השינויים נשמרו',
    'cv.edit.preview': 'תצוגה מקדימה',
    'cv.edit.previewContact': 'פרטי קשר',
    'cv.edit.previewSummary': 'סיכום מקצועי',
    'cv.edit.previewSkills': 'כישורים',
    'cv.edit.previewExperience': 'ניסיון תעסוקתי',
    'cv.edit.previewEducation': 'השכלה',
    'cv.edit.prev': 'הקודם',
    'cv.edit.next': 'המשך',
    'cv.edit.add': 'הוספה',
    'cv.edit.remove': 'הסרה',
    'cv.edit.enhanceAi': 'Enhance with AI',
    'cv.edit.enhancing': 'משפר…',
    'cv.edit.step.upload': 'העלאה',
    'cv.edit.step.personal': 'פרטים אישיים',
    'cv.edit.step.contact': 'פרטי קשר',
    'cv.edit.step.experience': 'ניסיון תעסוקתי',
    'cv.edit.step.skills': 'כישורים',
    'cv.edit.step.education': 'השכלה',
    'cv.edit.step.summary': 'סיכום מקצועי',
    'cv.edit.step.extra': 'סעיפים נוספים',
    'cv.edit.upload.title': 'בואו נתחיל בבניית הקריירה שלך',
    'cv.edit.upload.sub': 'העלו קובץ קיים ונמלא את השדות אוטומטית (PDF או DOCX).',
    'cv.edit.upload.drop': 'גררו קובץ לכאן',
    'cv.edit.upload.formats': 'PDF או DOCX, עד 10MB',
    'cv.edit.upload.choose': 'בחירת קובץ מהמחשב',
    'cv.edit.upload.parsing': 'סורקים את הקובץ…',
    'cv.edit.upload.errorType': 'סוג קובץ לא נתמך. השתמשו ב-PDF או DOCX.',
    'cv.edit.upload.errorSize': 'הקובץ גדול מדי (מקסימום 10MB).',
    'cv.edit.upload.errorParse': 'לא הצלחנו לקרוא את הקובץ. נסו קובץ אחר.',
    'cv.edit.personal.title': 'פרטים אישיים',
    'cv.edit.personal.firstName': 'שם פרטי',
    'cv.edit.personal.lastName': 'שם משפחה',
    'cv.edit.personal.role': 'תפקיד מבוקש',
    'cv.edit.personal.headline': 'תמצית מקצועית',
    'cv.edit.personal.headlineHint': 'כמה מילים על הניסיון והשאיפות — מושך למגייסים.',
    'cv.edit.personal.headlinePh': 'לדוגמה: מפתח Full Stack עם ניסיון בבניית מערכות בקנה מידה…',
    'cv.edit.contact.title': 'פרטי קשר',
    'cv.edit.contact.email': 'אימייל',
    'cv.edit.contact.phone': 'טלפון',
    'cv.edit.contact.country': 'מדינה',
    'cv.edit.contact.city': 'עיר',
    'cv.edit.contact.address': 'כתובת',
    'cv.edit.contact.zip': 'מיקוד',
    'cv.edit.experience.title': 'ניסיון תעסוקתי',
    'cv.edit.experience.item': 'תפקיד',
    'cv.edit.experience.jobTitle': 'תיאור תפקיד',
    'cv.edit.experience.company': 'חברה',
    'cv.edit.experience.start': 'תאריך התחלה',
    'cv.edit.experience.end': 'תאריך סיום',
    'cv.edit.experience.current': 'עדיין עובד כאן',
    'cv.edit.experience.present': 'היום',
    'cv.edit.experience.location': 'מיקום',
    'cv.edit.experience.desc': 'תיאור',
    'cv.edit.experience.descPh': 'הישגים ואחריות…',
    'cv.edit.skills.title': 'כישורים',
    'cv.edit.skills.sub': 'הצעות לפי התפקיד — בחרו מהרשימה או הוסיפו משלכם.',
    'cv.edit.skills.aiFor': 'הצעות AI עבור',
    'cv.edit.skills.refresh': 'רענון',
    'cv.edit.skills.add': 'הוספת כישור',
    'cv.edit.skills.addPh': 'הקלידו כישור חדש',
    'cv.edit.education.title': 'השכלה',
    'cv.edit.education.item': 'לימודים',
    'cv.edit.education.institution': 'מוסד לימודים',
    'cv.edit.education.degree': 'תואר',
    'cv.edit.education.years': 'שנים (טקסט חופשי)',
    'cv.edit.education.start': 'תאריך התחלה',
    'cv.edit.education.end': 'תאריך סיום',
    'cv.edit.education.desc': 'פרטים נוספים',
    'cv.edit.education.descPh': 'פרויקטים, הישגים, ממוצע…',
    'cv.edit.summary.title': 'סיכום מקצועי',
    'cv.edit.summary.sub':
      'כתבו סיכום קצר שמדגיש את ההישגים המרכזיים. לרוב זה הדבר הראשון שמגייסים קוראים.',
    'cv.edit.summary.text': 'הזנת טקסט',
    'cv.edit.summary.voice': 'הזנה קולית',
    'cv.edit.summary.stopVoice': 'עצור האזנה',
    'cv.edit.summary.listening': 'מאזין…',
    'cv.edit.summary.ph': 'הקלידו את הסיכום המקצועי שלכם…',
    'cv.edit.extra.title': 'הוספת סעיף',
    'cv.edit.extra.sub': 'בחרו סוג סעיף להוספה ומלאו את הפרטים.',
    'cv.edit.extra.choose': 'סוגי סעיפים',
    'cv.edit.extra.empty': 'לחצו על אחד מהסעיפים למעלה כדי להתחיל.',
    'cv.edit.extra.sectionTitle': 'כותרת הסעיף',
    'cv.edit.extra.sectionBody': 'תוכן הסעיף',
    'cv.edit.extra.kind.websites': 'אתרים',
    'cv.edit.extra.kind.portfolios': 'תיקי עבודות',
    'cv.edit.extra.kind.profiles': 'פרופילים',
    'cv.edit.extra.kind.languages': 'שפות',
    'cv.edit.extra.kind.software': 'תוכנות',
    'cv.edit.extra.kind.additional': 'מידע נוסף',
    'cv.edit.extra.kind.hobbies': 'תחביבים',
    'cv.edit.extra.placeholder.websites': 'לדוגמה:\nhttps://mysite.com\nhttps://github.com/username',
    'cv.edit.extra.placeholder.portfolios': 'לדוגמה:\nhttps://behance.net/...\nhttps://dribbble.com/...',
    'cv.edit.extra.placeholder.profiles': 'לדוגמה:\nLinkedIn: linkedin.com/in/...\nGitHub: github.com/...',
    'cv.edit.extra.placeholder.languages': 'לדוגמה:\nעברית — שפת אם\nאנגלית — שוטפת',
    'cv.edit.extra.placeholder.software': 'לדוגמה:\nFigma, Photoshop\nJira, Confluence',
    'cv.edit.extra.placeholder.additional': 'פרסומים, התנדבות, רישיונות, הישגים או מידע רלוונטי אחר…',
    'cv.edit.extra.placeholder.hobbies': 'לדוגמה:\nצילום, טיולים\nשחמט, קריאה',

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
    'nav.cv': 'Resume builder',
    'nav.smartcrop': 'SmartCrop',
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
    'seo.title.cv': 'Resume builder — LYA SOLUTION',
    'seo.desc.cv':
      'Choose your path: build from scratch, improve with AI, or tailor your CV to a job posting — professional results.',
    'seo.title.smartcrop': 'SmartCrop — LYA SOLUTION',
    'seo.desc.smartcrop':
      'Smart photo-print workflow: WhatsApp ingestion, focal-point auto-crop, and a client portal to review and approve prints.',
    'seo.title.smartcropLogin': 'SmartCrop sign-in — LYA SOLUTION',
    'seo.desc.smartcropLogin': 'Sign in with Google or phone to sync WhatsApp photos and approve prints.',
    'seo.title.smartcropDash': 'SmartCrop dashboard — LYA SOLUTION',
    'seo.desc.smartcropDash': 'View, edit, and approve print photos with smart cropping.',

    'smartcrop.hero.title': 'Print-ready crops without chopping heads',
    'smartcrop.hero.subtitle':
      'SmartCrop ingests photos and size instructions from WhatsApp, auto-centers on the subject, and lets customers fine-tune before print.',
    'smartcrop.hero.cta': 'Open client portal',
    'smartcrop.hero.demo': 'Try demo gallery',
    'smartcrop.hero.openDash': 'Go to dashboard',
    'smartcrop.hero.contact': 'Talk to us',
    'smartcrop.demo.title': 'Demo print gallery',
    'smartcrop.demo.subtitle': 'Browse photos with print sizes, change size, and fine-tune crops one by one — no sign-in required.',
    'smartcrop.demo.back': 'Back',
    'smartcrop.demo.hint': 'Tap the pen icon to adjust a crop. After save, the next photo opens automatically.',
    'smartcrop.demo.cropSaved': 'Crop saved — moving to the next photo.',
    'smartcrop.demo.resetAi': 'Reset to auto-center crop.',
    'smartcrop.demo.sizeChanged': 'Size updated to {size} and crop recomputed.',
    'smartcrop.feature.1.title': 'WhatsApp intake',
    'smartcrop.feature.1.body': 'Photos and print sizes arrive automatically — plus a demo upload from the portal.',
    'smartcrop.feature.2.title': 'Smart auto-crop',
    'smartcrop.feature.2.body': 'Focal-point detection with top safety padding so heads and subjects stay in frame.',
    'smartcrop.feature.3.title': 'Client portal',
    'smartcrop.feature.3.body': 'Grid review, crop editor, batch actions, and approve-to-print — Hebrew and English.',
    'smartcrop.preview.title': 'How prints look',
    'smartcrop.preview.subtitle': 'Sample photos with different print sizes — open the gallery to fine-tune crops by hand.',
    'smartcrop.preview.cta': 'Open the demo gallery',
    'smartcrop.preview.shot1': 'Family',
    'smartcrop.preview.shot2': 'Kids',
    'smartcrop.preview.shot3': 'Couple',
    'smartcrop.preview.shot4': 'Pets',
    'smartcrop.login.back': 'Back',
    'smartcrop.login.title': 'Sign in to SmartCrop',
    'smartcrop.login.subtitle': 'Sync your WhatsApp photos with your customer account.',
    'smartcrop.login.google': 'Continue with Google',
    'smartcrop.login.or': 'or',
    'smartcrop.login.sendOtp': 'Send SMS code',
    'smartcrop.login.otp': 'Verification code',
    'smartcrop.login.verify': 'Verify & continue',
    'smartcrop.login.continue': 'Continue to dashboard',
    'smartcrop.login.noSupabase': 'Supabase is not configured in the environment.',
    'smartcrop.phone.title': 'Link your WhatsApp number',
    'smartcrop.phone.body': 'Enter your phone number to attach WhatsApp photos to this account.',
    'smartcrop.phone.label': 'Phone number',
    'smartcrop.phone.placeholder': '+9725...',
    'smartcrop.phone.save': 'Save & sync',
    'smartcrop.phone.later': 'Later',
    'smartcrop.phone.invalid': 'Invalid phone number (use E.164).',
    'smartcrop.dash.title': 'My prints',
    'smartcrop.dash.signOut': 'Sign out',
    'smartcrop.dash.statusNone': 'No active order',
    'smartcrop.dash.search': 'Search…',
    'smartcrop.dash.filterAll': 'All statuses',
    'smartcrop.dash.sizeAll': 'All sizes',
    'smartcrop.dash.selectAll': 'Select all',
    'smartcrop.dash.simulate': 'Simulate WhatsApp',
    'smartcrop.dash.approveAll': 'Approve all & print',
    'smartcrop.dash.loading': 'Loading photos…',
    'smartcrop.dash.empty': 'No photos yet. Send via WhatsApp or use the simulate upload.',
    'smartcrop.dash.backLanding': 'Back to SmartCrop',
    'smartcrop.dash.confirmDelete': 'Delete selected photos?',
    'smartcrop.dash.approved': 'Photos approved.',
    'smartcrop.dash.needPhone': 'Add a phone number before simulating.',
    'smartcrop.dash.noApi': 'SmartCrop API URL is not configured.',
    'smartcrop.dash.simulated': 'Photo ingested and cropped.',
    'smartcrop.card.original': 'Original',
    'smartcrop.card.crop': 'Print crop',
    'smartcrop.card.edit': 'Edit crop',
    'smartcrop.card.delete': 'Delete',
    'smartcrop.batch.selected': '{n} selected',
    'smartcrop.batch.changeSize': 'Change size',
    'smartcrop.batch.pickSize': 'Pick size',
    'smartcrop.batch.approve': 'Approve selected',
    'smartcrop.batch.delete': 'Delete selected',
    'smartcrop.batch.clear': 'Clear',
    'smartcrop.crop.title': 'Edit crop',
    'smartcrop.crop.printSize': 'Print size',
    'smartcrop.crop.ratio': 'Aspect ratio',
    'smartcrop.crop.close': 'Close',
    'smartcrop.crop.zoom': 'Zoom',
    'smartcrop.crop.rotateLeft': 'Rotate left',
    'smartcrop.crop.rotateRight': 'Rotate right',
    'smartcrop.crop.loadFailed': 'Failed to load image.',
    'smartcrop.crop.resetAi': 'Reset to AI auto-center',
    'smartcrop.crop.save': 'Save crop',

    'cv.hero.title': 'Your professional future starts here',
    'cv.hero.subtitle':
      'Choose the path that fits you to create professional, accurate, and impressive résumés with advanced AI.',
    'cv.path.1.title': 'Create from scratch',
    'cv.path.1.body':
      'Build your CV step by step with an intuitive interface and built-in guidance along the way.',
    'cv.path.1.cta': 'Start now',
    'cv.path.2.badge': 'Popular',
    'cv.path.2.title': 'Improve with AI',
    'cv.path.2.body':
      'Upload an existing file and let our AI upgrade wording and design to a world-class level.',
    'cv.path.2.cta': 'Upload file',
    'cv.path.3.title': 'Job matching',
    'cv.path.3.body':
      'Paste a job description and we will tailor your CV to what recruiters are looking for.',
    'cv.path.3.cta': 'Match job',
    'cv.cta.title': 'Ready for the next step?',
    'cv.cta.sub':
      'Join thousands of professionals already using LYA to land their dream role.',
    'cv.cta.button': 'Get in touch',

    'seo.title.cvBuilder': 'CV builder — LYA SOLUTION',
    'seo.desc.cvBuilder': 'Build your résumé step by step with live preview, AI enhancements, and PDF/DOCX import.',
    'cv.edit.back': 'Back',
    'cv.edit.saved': 'All changes saved',
    'cv.edit.preview': 'Preview',
    'cv.edit.previewContact': 'Contact',
    'cv.edit.previewSummary': 'Professional summary',
    'cv.edit.previewSkills': 'Skills',
    'cv.edit.previewExperience': 'Work experience',
    'cv.edit.previewEducation': 'Education',
    'cv.edit.prev': 'Previous',
    'cv.edit.next': 'Next',
    'cv.edit.add': 'Add',
    'cv.edit.remove': 'Remove',
    'cv.edit.enhanceAi': 'Enhance with AI',
    'cv.edit.enhancing': 'Enhancing…',
    'cv.edit.step.upload': 'Upload',
    'cv.edit.step.personal': 'Personal details',
    'cv.edit.step.contact': 'Contact info',
    'cv.edit.step.experience': 'Work experience',
    'cv.edit.step.skills': 'Skills',
    'cv.edit.step.education': 'Education',
    'cv.edit.step.summary': 'Professional summary',
    'cv.edit.step.extra': 'Add section',
    'cv.edit.upload.title': "Let's start building your career",
    'cv.edit.upload.sub': 'Upload an existing file and we will fill the sections automatically (PDF or DOCX).',
    'cv.edit.upload.drop': 'Drag a file here',
    'cv.edit.upload.formats': 'PDF or DOCX, up to 10MB',
    'cv.edit.upload.choose': 'Choose file from computer',
    'cv.edit.upload.parsing': 'Scanning your file…',
    'cv.edit.upload.errorType': 'Unsupported file type. Use PDF or DOCX.',
    'cv.edit.upload.errorSize': 'File is too large (max 10MB).',
    'cv.edit.upload.errorParse': 'Could not read the file. Try another file.',
    'cv.edit.personal.title': 'Personal details',
    'cv.edit.personal.firstName': 'First name',
    'cv.edit.personal.lastName': 'Last name',
    'cv.edit.personal.role': 'Desired role',
    'cv.edit.personal.headline': 'Professional headline',
    'cv.edit.personal.headlineHint': 'A few words on your experience and goals — written to attract recruiters.',
    'cv.edit.personal.headlinePh': 'e.g. Full Stack developer building scalable production systems…',
    'cv.edit.contact.title': 'Contact info',
    'cv.edit.contact.email': 'Email',
    'cv.edit.contact.phone': 'Phone',
    'cv.edit.contact.country': 'Country',
    'cv.edit.contact.city': 'City',
    'cv.edit.contact.address': 'Address',
    'cv.edit.contact.zip': 'ZIP / postal code',
    'cv.edit.experience.title': 'Work experience',
    'cv.edit.experience.item': 'Role',
    'cv.edit.experience.jobTitle': 'Job title',
    'cv.edit.experience.company': 'Company',
    'cv.edit.experience.start': 'Start date',
    'cv.edit.experience.end': 'End date',
    'cv.edit.experience.current': 'Still working here',
    'cv.edit.experience.present': 'Present',
    'cv.edit.experience.location': 'Location',
    'cv.edit.experience.desc': 'Description',
    'cv.edit.experience.descPh': 'Achievements and responsibilities…',
    'cv.edit.skills.title': 'Skills',
    'cv.edit.skills.sub': 'Suggestions based on your role — pick from the list or add your own.',
    'cv.edit.skills.aiFor': 'AI suggested for',
    'cv.edit.skills.refresh': 'Refresh',
    'cv.edit.skills.add': 'Add skill',
    'cv.edit.skills.addPh': 'Type a new skill',
    'cv.edit.education.title': 'Education',
    'cv.edit.education.item': 'Entry',
    'cv.edit.education.institution': 'Institution',
    'cv.edit.education.degree': 'Degree',
    'cv.edit.education.years': 'Years (free text)',
    'cv.edit.education.start': 'Start date',
    'cv.edit.education.end': 'End date',
    'cv.edit.education.desc': 'Additional details',
    'cv.edit.education.descPh': 'Projects, honors, GPA…',
    'cv.edit.summary.title': 'Professional summary',
    'cv.edit.summary.sub':
      'Write a short summary that highlights your biggest achievements. This is often the first thing recruiters read.',
    'cv.edit.summary.text': 'Text entry',
    'cv.edit.summary.voice': 'Voice entry',
    'cv.edit.summary.stopVoice': 'Stop listening',
    'cv.edit.summary.listening': 'Listening…',
    'cv.edit.summary.ph': 'Type your professional summary…',
    'cv.edit.extra.title': 'Add section',
    'cv.edit.extra.sub': 'Choose a section type to add and fill in the details.',
    'cv.edit.extra.choose': 'Section types',
    'cv.edit.extra.empty': 'Click one of the section types above to get started.',
    'cv.edit.extra.sectionTitle': 'Section title',
    'cv.edit.extra.sectionBody': 'Section content',
    'cv.edit.extra.kind.websites': 'Websites',
    'cv.edit.extra.kind.portfolios': 'Portfolios',
    'cv.edit.extra.kind.profiles': 'Profiles',
    'cv.edit.extra.kind.languages': 'Languages',
    'cv.edit.extra.kind.software': 'Software',
    'cv.edit.extra.kind.additional': 'Additional Information',
    'cv.edit.extra.kind.hobbies': 'Hobbies',
    'cv.edit.extra.placeholder.websites': 'e.g.\nhttps://mysite.com\nhttps://github.com/username',
    'cv.edit.extra.placeholder.portfolios': 'e.g.\nhttps://behance.net/...\nhttps://dribbble.com/...',
    'cv.edit.extra.placeholder.profiles': 'e.g.\nLinkedIn: linkedin.com/in/...\nGitHub: github.com/...',
    'cv.edit.extra.placeholder.languages': 'e.g.\nHebrew — Native\nEnglish — Fluent',
    'cv.edit.extra.placeholder.software': 'e.g.\nFigma, Photoshop\nJira, Confluence',
    'cv.edit.extra.placeholder.additional': 'Publications, volunteering, licenses, awards, or other relevant info…',
    'cv.edit.extra.placeholder.hobbies': 'e.g.\nPhotography, hiking\nChess, reading',

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
