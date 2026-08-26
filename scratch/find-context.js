const fs = require('fs');
const html = fs.readFileSync('our_crawler_dom.html', 'utf-8');
const index = html.indexOf('name="order_date"');
if (index !== -1) {
    console.log(html.substring(Math.max(0, index - 500), Math.min(html.length, index + 300)));
}
