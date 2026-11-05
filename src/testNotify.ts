import { fetchProducts } from "./cex";
import { emailConfigured, sendDailyEmail, sendStartupNotice, sendTestEmail } from "./notify";

// Usage: npm run test:notify            -> sample alert (restock + sold out + stock down, live data)
//        npm run test:notify -- startup -> the "monitor started" email with the full watchlist
//        npm run test:notify -- daily   -> the daily check-in email
const which = ["startup", "daily"].includes(process.argv[2]) ? process.argv[2] : "alert";

async function main(): Promise<void> {
  if (!emailConfigured()) throw new Error("Set RESEND_API_KEY and EMAIL_TO first.");
  const products = await fetchProducts();
  if (which === "startup") await sendStartupNotice(products);
  else if (which === "daily") {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    await sendDailyEmail({
      products,
      stats: { since, checks: 288, failures: 0, restocks: 3, reduced: 5, soldOut: 1, emailsSent: 6, lastError: null },
      lastCheckAt: new Date().toISOString(),
      lastCheckOk: true,
      lastCheckError: null,
    });
  } else await sendTestEmail(products);
  console.log(`Test ${which} email sent.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
