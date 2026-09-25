import { parseWhatsAppOrder, buildHotfolderPath } from '../lib/whatsappParser.mjs';

const o = parseWhatsAppOrder('היי, תדפיסו 5 עותקים ב-13x18 סמ דני קליין 0501234567 Lustre');
console.log(o);
console.log(buildHotfolderPath(o.customerName, o.customerPhone, o.sizeName));
