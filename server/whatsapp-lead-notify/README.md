# Lead notifications: WhatsApp + Gmail (`whatsapp-web.js` + Nodemailer)

שרת Node שמקבל **POST** אחרי טופס צור קשר: **WhatsApp** לבעלים (ברירת מחדל `972509250384`) וגם **מייל אישור ללקוח** דרך Gmail (אופציונלי: `GMAIL_USER` + `GMAIL_APP_PASSWORD`).

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

`GET /health` מחזיר גם `gmailConfigured: true/false`.

## Gmail (confirmation to the person who submitted the form)

1. Google account with **2-Step Verification** (required — without it you cannot create App Passwords).
2. Create an **App password**: https://myaccount.google.com/apppasswords — choose “Mail” / “Other”, copy the **16-character** password into `GMAIL_APP_PASSWORD` (spaces are stripped automatically).
3. Set `GMAIL_USER` to the **full Gmail address** (same account).

**If you see `Invalid login` / `535`:** you are almost certainly using your **normal Gmail password**. Google does not allow that for SMTP anymore. You **must** use an **App Password**, not the password you use to sign in on the web.

If Gmail is configured but WhatsApp is not ready yet, the API can still return **200** when the email sends successfully.

## משתני סביבה

| משתנה | תיאור |
|--------|--------|
| `PORT` | פורט (ברירת מחדל `3840`) |
| `API_KEY` | חובה ב-production; ב-dev מומלץ; header `x-api-key` |
| `NOTIFY_MAX_PER_IP` | Max notify POSTs per IP per window (default 30) |
| `NOTIFY_WINDOW_MS` | Rate-limit window in ms (default 900000) |
| `TRUST_PROXY_HOPS` | Trust X-Forwarded-For hops (default 1; use behind Render) |
| `WWEBJS_DATA_PATH` | תיקיית סשן WhatsApp (דיסק קבוע בפרודקשן) |
| `OWNER_WHATSAPP_E164` | מספר יעד בלי `+`, ברירת מחדל `+972509250384` |
| `GMAIL_USER` | Gmail address used to send mail |
| `GMAIL_APP_PASSWORD` | Google App Password (not your normal password) |
| `GMAIL_FROM_NAME` | Optional display name (default `Lya Solution`) |
| `CLIENT_EMAIL_SUBJECT` | Optional subject line for the client email |
| `CORS_ORIGIN` | מקורות מותרים לדפדפן, מופרדים בפסיקים; בפרודקשן מומלץ לציין את דומיין האתר |

## פרודקשן

- השרת חייב לרוץ **תמיד** (VPS, Railway, Render, מחשב בבית עם PM2 וכו'). **לא** מתאים ל־Vercel serverless.
- ב־Vercel של האתר הגדירי `LEAD_NOTIFY_API_URL` (כתובת מלאה לשרת, למשל `https://notify.example.com`) ו־`LEAD_NOTIFY_API_KEY` (אותו `API_KEY` כמו בשרת).
- פתחי חומת אש לפורט או השתמשו ב־reverse proxy עם HTTPS.

### Render + Chrome (“Could not find Chrome”)

On Render, **Native Node** often has no Puppeteer-downloaded browser, so you may see: `Could not find Chrome (ver. …)`.

**Use Docker** for this service:

1. Render → your Web Service → **Settings** → **Environment** = **Docker** (not Node).
2. **Root directory:** `server/whatsapp-lead-notify` (uses `Dockerfile` in that folder).
3. Start command is already `npm start` in the image; Render sets `PORT`.
4. Image env: `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
5. Keep **`WWEBJS_DATA_PATH`** on your persistent disk mount.

Local: `docker build -t lead-notify .` then `docker run --rm -e API_KEY=test -e PORT=3840 -p 3840:3840 lead-notify`

**QR on Render:** log viewers often break ASCII QR art. When the server logs `WhatsApp QR image ready`, open in a browser (use a private window; the URL contains your secret):

`https://<your-service>.onrender.com/setup/qr?token=<same value as API_KEY>`

`GET /health` includes `whatsappQrAvailable: true` while a QR is available.

## אבטחה

- ב-production (`NODE_ENV=production`, למשל Render) חובה **`API_KEY`** — בלי זה השרת לא יעלה (מונע נקודת קצה פתוחה).
- **Rate limit** on `POST /api/notify-lead` (`NOTIFY_MAX_PER_IP`, `NOTIFY_WINDOW_MS`).
- השוואת מפתח עם **timing-safe** (מפחית חשיפת המפתח דרך זמני תגובה).
- אורכי שדות מוגבלים כדי למנוע הודעות ענק / ניסיונות DoS.
- **מפתח בצד הדפדפן עדיין נחשף** בבניית הפרונט — מי שמחפש בקוד יכול לשלוח בקשות. ה-rate limit והמפתח מצמצמים ספאם; לרמת אבטחה גבוהה: **proxy** (למשל Supabase Edge Function עם סוד בצד שרת בלבד) שקורא לשרת הזה אחרי אימות — לא ממומש כאן.
