# WhatsApp lead notifications (`whatsapp-web.js`)

שרת Node קטן שמקבל **POST** מהאתר אחרי מילוי טופס צור קשר, ושולח **הודעת WhatsApp** לבעלים (ברירת מחדל: `972509250384` — 050-9250384).

## איך זה עובד

1. `whatsapp-web.js` מפעיל סשן של **WhatsApp Web** על המחשב/שרת שמריצים עליו את התהליך.
2. בפעם הראשונה יופיע **QR** בטרמינל — סריקה מהטלפון: **WhatsApp → מכשירים מקושרים**.
3. הסשן נשמר בתיקייה `.wwebjs_auth` (לא לשתף / לא לעלות ל-Git).
4. האתר (Angular) שולח `POST` ל־`/api/notify-lead` עם פרטי הליד (אחרי שמירה מוצלחת ב-Supabase).

## התקנה והרצה

```bash
cd server/whatsapp-lead-notify
npm install
set API_KEY=your-secret-here
npm start
```

סריקת QR פעם אחת. אחרי `ready` — בדיקה:

```bash
curl http://localhost:3840/health
```

## משתני סביבה

| משתנה | תיאור |
|--------|--------|
| `PORT` | פורט (ברירת מחדל `3840`) |
| `API_KEY` | אם מוגדר — חובה header `x-api-key` זהה (מומלץ) |
| `OWNER_WHATSAPP_E164` | מספר יעד בלי `+`, ברירת מחדל `972509250384` |
| `CORS_ORIGIN` | מקורות מותרים לדפדפן, מופרדים בפסיקים; בפרודקשן מומלץ לציין את דומיין האתר |

## פרודקשן

- השרת חייב לרוץ **תמיד** (VPS, Railway, Render, מחשב בבית עם PM2 וכו'). **לא** מתאים ל־Vercel serverless.
- ב־Vercel של האתר הגדירי `LEAD_NOTIFY_API_URL` (כתובת מלאה לשרת, למשל `https://notify.example.com`) ו־`LEAD_NOTIFY_API_KEY` (אותו `API_KEY` כמו בשרת).
- פתחי חומת אש לפורט או השתמשו ב־reverse proxy עם HTTPS.

## אבטחה

מפתח בצד הדפדפן **נחשף** בבניית הפרונט. לשימוש אמיתי שקלו **proxy** (למשל Supabase Edge Function עם סוד) שקורא לשרת הזה — לא ממומש כאן.
