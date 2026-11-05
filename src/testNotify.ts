import { fetchProducts } from "./cex";
import { emailConfigured, sendStartupNotice, sendTestEmail } from "./notify";

// Usage: npm run test:notify            -> sample stock alert (live data)
//        npm run test:notify -- startup -> the "monitor started" email with the full watchlist
const which = process.argv[2] === "startup" ? "startup" : "alert";

async function main(): Promise<void> {
  if (!emailConfigured()) throw new Error("Set RESEND_API_KEY and EMAIL_TO first.");
  const products = await fetchProducts();
  if (which === "startup") await sendStartupNotice(products);
  else await sendTestEmail(products);
  console.log(`Test ${which} email sent.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
