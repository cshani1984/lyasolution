export type ScLandingLang = 'he' | 'en';

export interface ScLandingFaq {
  q: string;
  a: string;
}

export interface ScLandingCopy {
  navFeatures: string;
  navHow: string;
  navCompare: string;
  navTestimonials: string;
  navFaq: string;
  login: string;
  trialCta: string;
  menu: string;
  account: string;
  heroTitleBefore: string;
  heroTitleGrad: string;
  heroLede: string;
  heroTrial: string;
  heroDemo: string;
  proofLabs: string;
  proofWhatsapp: string;
  mockLabel: string;
  ratioIn: string;
  ratioOut: string;
  customerName: string;
  customerStatus: string;
  parsed: string;
  chatMsg: string;
  orderLine: string;
  botMsg: string;
  botMeta: string;
  dpiTag: string;
  hotfolderTag: string;
  compareTitle: string;
  compareSub: string;
  faceBadge: string;
  badCropTitle: string;
  badCropBadge: string;
  badCropWarn: string;
  badCropBody: string;
  goodCropTitle: string;
  goodCropBadge: string;
  goodCropSafe: string;
  goodCropEye: string;
  goodCropBody: string;
  telemetryAi: string;
  telemetryFit: string;
  telemetryReady: string;
  problemKicker: string;
  problemTitle: string;
  problemLede: string;
  card1Title: string;
  card1Body: string;
  card1Stat1: string;
  card1Stat1Val: string;
  card1Stat2: string;
  card1Stat2Val: string;
  card2Title: string;
  card2Body: string;
  card2Stat1: string;
  card2Stat1Val: string;
  card2Stat2: string;
  card2Stat2Val: string;
  card3Title: string;
  card3Body: string;
  card3Stat1: string;
  card3Stat1Val: string;
  card3Stat2: string;
  card3Stat2Val: string;
  howKicker: string;
  howTitle: string;
  howLede: string;
  step1Label: string;
  step1Title: string;
  step1Body: string;
  step1Chat: string;
  step1Parsed: string;
  step1Foot: string;
  step2Label: string;
  step2Title: string;
  step2Body: string;
  step2Depth: string;
  step2DepthVal: string;
  step2Sr: string;
  step2SrVal: string;
  step2Foot: string;
  step3Label: string;
  step3Title: string;
  step3Body: string;
  step3Path: string;
  step3Foot: string;
  compareKicker: string;
  compareH2: string;
  compareLede: string;
  oldCropTitle: string;
  oldCropBody: string;
  smartGuardTitle: string;
  smartGuardBody: string;
  tryFree: string;
  mapTitle: string;
  mapBadge: string;
  mapZone: string;
  mapFamily: string;
  mapDanger: string;
  mapDpi: string;
  mapDpiVal: string;
  mapBleed: string;
  mapBleedVal: string;
  mapRender: string;
  mapRenderVal: string;
  testimonialsKicker: string;
  testimonialsTitle: string;
  testimonialsLede: string;
  review1: string;
  review1Name: string;
  review1Role: string;
  review2: string;
  review2Name: string;
  review2Role: string;
  faqKicker: string;
  faqTitle: string;
  faqs: ScLandingFaq[];
  finalChip: string;
  finalTitle: string;
  finalLede: string;
  finalStart: string;
  finalWhatsapp: string;
  finalNoCard: string;
  finalSupport: string;
  footerAbout: string;
  footerProduct: string;
  footerAi: string;
  footerWa: string;
  footerFlow: string;
  footerDemo: string;
  footerSupport: string;
  footerFaq: string;
  footerStories: string;
  footerRights: string;
}

export const SC_LANDING: Record<ScLandingLang, ScLandingCopy> = {
  he: {
    navFeatures: 'תכונות',
    navHow: 'איך זה עובד',
    navCompare: 'השוואת חיתוך AI',
    navTestimonials: 'המלצות',
    navFaq: 'שאלות נפוצות',
    login: 'כניסה למערכת',
    trialCta: 'התחל 30 ימי ניסיון חינם',
    menu: 'תפריט',
    account: 'חשבון',
    heroTitleBefore: 'קבלת הזמנות הדפסה ישירות מוואטסאפ — עם חיתוך פוטו אוטומטי מבוסס',
    heroTitleGrad: 'AI שלעולם לא חותך ראשים',
    heroLede:
      'SmartCrop קולטת תמונות ומידות מבוקשות (10x15, 13x18, A4) ישירות מצ׳אט הוואטסאפ של הלקוח, מזהה פנים ומרכזת את הפריים עם מרווח ביטחון עליון מושלם, ושולחת ישר למדפסת ברזולוציית 300 DPI.',
    heroTrial: 'התחילו 30 ימי ניסיון חינם (ללא אשראי)',
    heroDemo: 'צפו בהדגמה חיה',
    proofLabs: 'מעל 120 מעבדות פוטו בישראל',
    proofWhatsapp: 'חיבור רשמי WhatsApp Cloud',
    mockLabel: 'מעבדת הדפסה מקושרת // Hotfolder Minilab 01',
    ratioIn: 'יחס נכנס: 4:3',
    ratioOut: 'הדפסה מבוקשת: 10x15 (יחס 2:3)',
    customerName: 'דני קליין (לקוח)',
    customerStatus: 'מחובר עכשיו דרך WhatsApp Business',
    parsed: 'מפוענח',
    chatMsg: 'שלום, רוצה להדפיס את התמונה הזו ב-10x15 על נייר מבריק! אפשרי שיהיה מוכן לעוד שעתיים?',
    orderLine: '10x15 • נייר גלוס • עותק 1',
    botMsg:
      'היי דני! זיהינו את הבקשה: 10x15 מבריק. התמונה נסרקה ב-SmartCrop, הראשים שמורים והקובץ מוכן להדפסה!',
    botMeta: '14:32 • בוט SmartCrop',
    dpiTag: 'DPI מקורי: 300',
    hotfolderTag: 'ניתוב Hotfolder מאושר',
    compareTitle: 'מנוע חיתוך AI מול חיתוך מרכזי טיפש',
    compareSub: 'הדמיית פלט להדפסת 10x15 מתוך תמונת סמארטפון 4:3',
    faceBadge: 'זיהוי פנים 99.8%',
    badCropTitle: 'חיתוך מרכזי רגיל (עיוור)',
    badCropBadge: 'פסולת דפוס',
    badCropWarn: 'חיתוך ראש קריטי: נחתך 18% מהפדחת',
    badCropBody: 'חיתוך מרכז אוטומטי במעבדות קלאסיות חותך את ראש האב. תלונה מובטחת של הלקוח ובזבוז נייר.',
    goodCropTitle: 'מנוע חיתוך SmartCrop AI',
    goodCropBadge: '100% הדפסה מושלמת',
    goodCropSafe: '+15% מרווח ביטחון לשיער (Headroom)',
    goodCropEye: 'מרכוז עין חכם',
    goodCropBody: 'זיהוי מדויק של קודקוד הראש, הפנים ומרכז הכובד. שומר על מרווח נשימה מקצועי ושולח ל-RIP.',
    telemetryAi: 'עיבוד AI: 142ms',
    telemetryFit: 'התאמה אוטומטית: 10.2x15.2 ס״מ',
    telemetryReady: 'מוכן להדפסה מיידית',
    problemKicker: 'למה מעבדות צילום מפסידות זמן וכסף בכל יום?',
    problemTitle: 'המעבר של הלקוחות לסמארטפונים הפך את הדפסת התמונות לסיוט תפעולי',
    problemLede:
      'סמארטפונים מצלמים ב-4:3 או 16:9, בעוד שניירות הצילום הסטנדרטיים הם 2:3. התוצאה: עבודה ידנית איטית, הדפסות שהולכות לפח וויכוחים מיותרים עם לקוחות.',
    card1Title: 'בעיית חיתוך הראשים הקלאסית',
    card1Body:
      'לקוחות שולחים תמונות מסמארטפון ומבקשים 10x15. תוכנת ההדפסה מבצעת חיתוך מרכזי עיוור וחותכת שיער, מצח או סנטר. המעבדה נאלצת לזרוק נייר יקר ולהדפיס מחדש.',
    card1Stat1: 'הדפסות פסולות בחודש:',
    card1Stat1Val: '~12% מההזמנות',
    card1Stat2: 'זמן התעסקות בפוטושופ:',
    card1Stat2Val: '2.5 שעות/יום',
    card2Title: 'פתרון AI Headroom Guard בלעדי',
    card2Body:
      'מנוע הראייה הממוחשבת של SmartCrop מזהה תווי פנים, עיניים וקווי שיער. הוא מזיז את תיבת החיתוך כך שתמיד יישמר מרווח נשימה של לפחות 15% מעל הראש הגבוה ביותר.',
    card2Stat1: 'הצלחת מרכוז ראש:',
    card2Stat1Val: '99.7% דיוק',
    card2Stat2: 'תמיכה בתמונות קבוצתיות:',
    card2Stat2Val: 'עד 32 פרצופים',
    card3Title: 'אישורי הדפסה אוטונומיים בווטסאפ',
    card3Body:
      'אין צורך באפליקציות. לקוח שולח תמונות לצ׳אט המעבדה, מקבל תצוגה מקדימה מדויקת ומאשר בקליק. ברגע האישור — הקובץ נזרק לתיקיית ההדפסה של המינילאב.',
    card3Stat1: 'חיסכון זמן למעבדה:',
    card3Stat1Val: '85% צמצום מענה',
    card3Stat2: 'שביעות רצון לקוח:',
    card3Stat2Val: '4.9 / 5.0',
    howKicker: 'איך זה עובד בפועל',
    howTitle: 'משליחת התמונה בוואטסאפ ועד ליציאה מהמינילאב ב-3 שלבים',
    howLede: 'הטמעה מלאה תוך 15 דקות. המערכת פועלת כענן לצד תוכנת ההדפסה הקיימת שלכם.',
    step1Label: 'קליטת פקודה',
    step1Title: 'הלקוח שולח תמונות לוואטסאפ',
    step1Body: 'הבוט מזהה מידות מבוקשות בכל שפה ובכל ניסוח: "10 על 15", "גלויה", "A4", "הגדלה 20x30".',
    step1Chat: '"היי, תדפיסו 5 עותקים ב-13x18 מט"',
    step1Parsed: 'פוענח: 5X | 130x180mm | נייר Lustre',
    step1Foot: 'אוטומציה מלאה // 0 שניות המתנה',
    step2Label: 'ניתוח AI',
    step2Title: 'ניתוח תווי פנים וחיתוך חכם',
    step2Body: 'SmartCrop סורקת את הפיקסלים, מזהה את כל האנשים בפריים, בונה תיבת ביטחון עליונה ומחשבת חיתוך אופטימלי ב-300 DPI.',
    step2Depth: 'דיוק מפת עומק:',
    step2DepthVal: 'Sub-pixel 0.05%',
    step2Sr: 'הגדלת רזולוציה חכמה:',
    step2SrVal: 'Super-Resolution',
    step2Foot: 'ללא איבוד איכות // שמירת ICC Color Profile',
    step3Label: 'פלט והדפסה',
    step3Title: 'התמונה מוכנה להדפסה',
    step3Body: 'התמונות מוכנות להדפסה במעבדה לפי לקוח.',
    step3Path: 'C:\\Hotfolder\\Dani_Klein_10x15\\',
    step3Foot: 'מוכן להדפסה',
    compareKicker: 'בדיקת מעבדה: פורטרט משפחתי',
    compareH2: 'איך בינה מלאכותית מונעת תלונות לקוחות?',
    compareLede:
      'בתמונה משפחתית טיפוסית שצולמה בסמארטפון, הראשים ממוקמים בחלק העליון. כאשר מרחיבים להתאמה לפורמט 10x15, חיתוך מרכזי מגלח בדיוק את ראשי ההורים.',
    oldCropTitle: 'חיתוך מרכזי ישן (Standard RIP)',
    oldCropBody: 'מתעלם מהפנים, חותך 5–8 ס״מ מעל הראש ומשאיר חולצות ורגליים מיותרות.',
    smartGuardTitle: 'SmartCrop Smart Guard',
    smartGuardBody: 'מזהה את הפנים הגבוהות ביותר, מגדיר תקרת בטיחות אוטומטית וחותך אך ורק מהחלק התחתון.',
    tryFree: 'בדקו את התמונות שלכם בחינם',
    mapTitle: 'הדמיית אזור הדפסה (10x15 ס״מ)',
    mapBadge: 'Dynamic Saliency Map',
    mapZone: 'אזור חיתוך SmartCrop AI (מושלם)',
    mapFamily: 'כל בני המשפחה נשמרו במלואם בפריים 10x15',
    mapDanger: 'סכנת חיתוך בחיתוך מרכזי רגיל',
    mapDpi: 'רזולוציית יעד',
    mapDpiVal: '300 DPI',
    mapBleed: 'שמירת שוליים',
    mapBleedVal: '3mm Bleed',
    mapRender: 'זמן רינדור',
    mapRenderVal: '0.18 שניות',
    testimonialsKicker: 'סיפורי הצלחה מהשטח',
    testimonialsTitle: 'מה אומרים מנהלי חנויות צילום בישראל?',
    testimonialsLede: 'מעבדות שחיברו את SmartCrop חוסכות בממוצע 3 שעות עבודה ידנית ביום ומבטלות כמעט לחלוטין את החזרות ההדפסה.',
    review1:
      '"SmartCrop חסך לנו לפחות 3 שעות עבודה ידנית בכל יום בחיתוך קבצים של לקוחות. מאז שהתקנו — אפס תלונות על ראשים חתוכים ואפס נייר שנזרק לפח!"',
    review1Name: 'אבי כהן',
    review1Role: 'בעלים, "פוטו פריזמה תל אביב" (מעבדת Noritsu)',
    review2:
      '"הלקוחות מתלהבים מהאישור בווטסאפ וההדפסות יוצאות ישר למינילאב. העובדים שלי כבר לא צריכים לענות להודעות כמו \'איזה גודל לשלוח\' — המערכת סוגרת את ההזמנה לבד."',
    review2Name: 'מירב לוי',
    review2Role: 'מנהלת, "סטודיו ארט ירושלים" (מעבדת Fuji Frontier)',
    faqKicker: 'שאלות ותשובות',
    faqTitle: 'כל מה שחשוב לדעת לפני שמתחילים',
    faqs: [
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
    ],
    finalChip: 'התחלה מיידית ב-30 שניות',
    finalTitle: 'מוכנים לחסוך 3 שעות עבודה ביום ולבטל הדפסות פסולות?',
    finalLede:
      'הצטרפו ל-120 מעבדות פוטו בישראל שכבר מקבלות הזמנות ישירות מוואטסאפ עם חיתוך בינה מלאכותית. 30 ימי התנסות מלאים ללא התחייבות.',
    finalStart: 'התחילו עכשיו בחינם',
    finalWhatsapp: 'שלחו לנו הודעה בוואטסאפ לתיאום הדגמה',
    finalNoCard: 'ללא צורך בכרטיס אשראי',
    finalSupport: 'ליווי ותמיכה בעברית',
    footerAbout: 'הפלטפורמה החכמה לחיתוך תמונות מבוסס בינה מלאכותית, עיבוד הדפסות וניתוב קבצים למעבדות צילום וחנויות פוטו.',
    footerProduct: 'מוצר ויכולות',
    footerAi: 'מנוע חיתוך אוטומטי AI',
    footerWa: 'אינטגרציית WhatsApp לחנויות',
    footerFlow: 'תהליך הזמנה אוטומטי',
    footerDemo: 'גלריית הדגמה',
    footerSupport: 'תמיכה ומידע',
    footerFaq: 'שאלות ותשובות',
    footerStories: 'סיפורי הצלחה ממעבדות',
    footerRights: '© 2026 כל הזכויות שמורות | LYA SOLUTION',
  },
  en: {
    navFeatures: 'Features',
    navHow: 'How it works',
    navCompare: 'AI crop comparison',
    navTestimonials: 'Testimonials',
    navFaq: 'FAQ',
    login: 'Sign in',
    trialCta: 'Start 30-day free trial',
    menu: 'Menu',
    account: 'Account',
    heroTitleBefore: 'Receive print orders straight from WhatsApp — with automatic photo cropping powered by',
    heroTitleGrad: 'AI that never chops heads',
    heroLede:
      'SmartCrop ingests photos and requested sizes (10x15, 13x18, A4) directly from your customer’s WhatsApp chat, detects faces, centers the frame with a perfect top safety margin, and sends print-ready files at 300 DPI.',
    heroTrial: 'Start 30-day free trial (no credit card)',
    heroDemo: 'Watch live demo',
    proofLabs: '120+ photo labs in Israel',
    proofWhatsapp: 'Official WhatsApp Cloud connection',
    mockLabel: 'Connected print lab // Hotfolder Minilab 01',
    ratioIn: 'Incoming ratio: 4:3',
    ratioOut: 'Requested print: 10x15 (2:3)',
    customerName: 'Danny Klein (customer)',
    customerStatus: 'Online via WhatsApp Business',
    parsed: 'Parsed',
    chatMsg: 'Hi, I want this printed as 10x15 on glossy paper! Can it be ready in two hours?',
    orderLine: '10x15 • Gloss paper • 1 copy',
    botMsg:
      'Hi Danny! We detected: 10x15 glossy. The image was scanned with SmartCrop — heads are safe and the file is print-ready!',
    botMeta: '14:32 • SmartCrop bot',
    dpiTag: 'Source DPI: 300',
    hotfolderTag: 'Hotfolder routing approved',
    compareTitle: 'AI crop engine vs naive center crop',
    compareSub: '10x15 print simulation from a 4:3 smartphone photo',
    faceBadge: 'Face detection 99.8%',
    badCropTitle: 'Regular center crop (blind)',
    badCropBadge: 'Print waste',
    badCropWarn: 'Critical head crop: 18% of forehead cut',
    badCropBody: 'Classic lab center-crop cuts the father’s head. Guaranteed customer complaint and wasted paper.',
    goodCropTitle: 'SmartCrop AI crop engine',
    goodCropBadge: '100% perfect print',
    goodCropSafe: '+15% hair headroom cushion',
    goodCropEye: 'Smart eye centering',
    goodCropBody: 'Precise detection of crown, face, and center of mass. Keeps professional breathing room and sends to RIP.',
    telemetryAi: 'AI processing: 142ms',
    telemetryFit: 'Auto fit: 10.2x15.2 cm',
    telemetryReady: 'Ready for immediate print',
    problemKicker: 'Why photo labs lose time and money every day',
    problemTitle: 'Smartphones turned photo printing into an operational nightmare',
    problemLede:
      'Phones shoot 4:3 or 16:9 while standard photo papers are 2:3. Result: slow manual work, prints in the trash, and unnecessary customer arguments.',
    card1Title: 'The classic head-chopping problem',
    card1Body:
      'Customers send smartphone photos and ask for 10x15. Print software does a blind center crop and cuts hair, forehead, or chin. The lab wastes expensive paper and reprints.',
    card1Stat1: 'Rejected prints / month:',
    card1Stat1Val: '~12% of orders',
    card1Stat2: 'Photoshop rework time:',
    card1Stat2Val: '2.5 hours/day',
    card2Title: 'Exclusive AI Headroom Guard',
    card2Body:
      'SmartCrop’s computer vision detects faces, eyes, and hairlines. It shifts the crop box so at least 15% breathing room remains above the tallest head.',
    card2Stat1: 'Head centering success:',
    card2Stat1Val: '99.7% accuracy',
    card2Stat2: 'Group photo support:',
    card2Stat2Val: 'Up to 32 faces',
    card3Title: 'Autonomous WhatsApp print approvals',
    card3Body:
      'No apps required. Customers send photos to the lab chat, get an accurate crop preview, and approve in one tap. On approval the file drops into the minilab hotfolder.',
    card3Stat1: 'Lab time saved:',
    card3Stat1Val: '85% less reply work',
    card3Stat2: 'Customer satisfaction:',
    card3Stat2Val: '4.9 / 5.0',
    howKicker: 'How it works',
    howTitle: 'From WhatsApp send to minilab output in 3 steps',
    howLede: 'Full setup in about 15 minutes. The system runs in the cloud alongside your existing print software.',
    step1Label: 'Order intake',
    step1Title: 'Customer sends photos on WhatsApp',
    step1Body: 'The bot detects requested sizes in any phrasing: “10 by 15”, “postcard”, “A4”, “20x30 enlargement”.',
    step1Chat: '"Hi, print 5 copies as 13x18 matte"',
    step1Parsed: 'Parsed: 5X | 130x180mm | Lustre paper',
    step1Foot: 'Full automation // 0 seconds wait',
    step2Label: 'AI analysis',
    step2Title: 'Face analysis and smart crop',
    step2Body: 'SmartCrop scans pixels, finds everyone in frame, builds a top safety box, and computes an optimal 300 DPI crop.',
    step2Depth: 'Depth-map precision:',
    step2DepthVal: 'Sub-pixel 0.05%',
    step2Sr: 'Smart upscaling:',
    step2SrVal: 'Super-Resolution',
    step2Foot: 'No quality loss // ICC color profile preserved',
    step3Label: 'Output & print',
    step3Title: 'The photo is print-ready',
    step3Body: 'Images are ready for lab printing, organized by customer.',
    step3Path: 'C:\\Hotfolder\\Danny_Klein_10x15\\',
    step3Foot: 'Ready to print',
    compareKicker: 'Lab check: family portrait',
    compareH2: 'How AI prevents customer complaints',
    compareLede:
      'In a typical smartphone family portrait, heads sit near the top. Expanding to 10x15 with a center crop shaves the parents’ heads.',
    oldCropTitle: 'Old center crop (Standard RIP)',
    oldCropBody: 'Ignores faces, cuts 5–8 cm above the head, and keeps unnecessary shirts and legs.',
    smartGuardTitle: 'SmartCrop Smart Guard',
    smartGuardBody: 'Finds the highest faces, sets an automatic safety ceiling, and crops only from the bottom.',
    tryFree: 'Try your photos for free',
    mapTitle: 'Print-area simulation (10x15 cm)',
    mapBadge: 'Dynamic Saliency Map',
    mapZone: 'SmartCrop AI crop zone (perfect)',
    mapFamily: 'All family members kept fully in the 10x15 frame',
    mapDanger: 'Crop risk with regular center crop',
    mapDpi: 'Target resolution',
    mapDpiVal: '300 DPI',
    mapBleed: 'Edge safety',
    mapBleedVal: '3mm Bleed',
    mapRender: 'Render time',
    mapRenderVal: '0.18 sec',
    testimonialsKicker: 'Success stories',
    testimonialsTitle: 'What photo shop managers in Israel say',
    testimonialsLede: 'Labs using SmartCrop save about 3 hours of manual work daily and nearly eliminate reprint returns.',
    review1:
      '"SmartCrop saved us at least 3 hours of manual cropping every day. Since we installed it — zero head-chop complaints and zero paper in the trash!"',
    review1Name: 'Avi Cohen',
    review1Role: 'Owner, Photo Prisma Tel Aviv (Noritsu lab)',
    review2:
      '"Customers love WhatsApp approval and prints go straight to the minilab. Staff no longer answer “which size?” — the system closes the order by itself."',
    review2Name: 'Meirav Levi',
    review2Role: 'Manager, Studio Art Jerusalem (Fuji Frontier lab)',
    faqKicker: 'FAQ',
    faqTitle: 'Everything to know before you start',
    faqs: [
      {
        q: 'How does SmartCrop connect to our shop WhatsApp?',
        a: 'Connection uses Meta’s official WhatsApp Business Cloud API. You can keep your existing lab number or add a dedicated ordering line. Setup takes about 5 minutes.',
      },
      {
        q: 'What about customer photo privacy?',
        a: 'Photos are processed in a secure environment and delivered to you as print-ready files. After processing they are deleted from processing servers within 24 hours under GDPR standards.',
      },
      {
        q: 'Do we need heavy software or special hardware?',
        a: 'No. SmartCrop runs fully in the cloud. You and your customers work in WhatsApp, and cropped files are available in the browser or sent automatically to the lab PC.',
      },
      {
        q: 'What if AI is unsure about an unusual crop?',
        a: 'When confidence drops below 95%, the photo is flagged in the dashboard as “needs a quick look”, or sent to the customer with a WhatsApp preview for approval.',
      },
    ],
    finalChip: 'Start in 30 seconds',
    finalTitle: 'Ready to save 3 hours a day and stop waste prints?',
    finalLede:
      'Join 120+ photo labs in Israel already taking WhatsApp orders with autonomous AI cropping. Full 30-day trial with no commitment.',
    finalStart: 'Start free now',
    finalWhatsapp: 'Message us on WhatsApp to book a demo',
    finalNoCard: 'No credit card required',
    finalSupport: 'Hebrew support & onboarding',
    footerAbout:
      'The smart platform for AI photo cropping, print processing, and file routing for photo labs and retail photo shops.',
    footerProduct: 'Product',
    footerAi: 'AI auto-crop engine',
    footerWa: 'WhatsApp shop integration',
    footerFlow: 'Automated order flow',
    footerDemo: 'Demo gallery',
    footerSupport: 'Support',
    footerFaq: 'FAQ',
    footerStories: 'Lab success stories',
    footerRights: '© 2026 All rights reserved | LYA SOLUTION.',
  },
};
