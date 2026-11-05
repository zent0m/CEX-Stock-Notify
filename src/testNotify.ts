import { config } from "./config";
import { sendPush } from "./notify";

sendPush({
  title: "£320 — Gigabyte GeForce RTX 3070 Gaming OC 8GB GDDR6 (TEST)",
  message: "Online: 0 → 1\nNew in store: Birmingham\nThis is a test notification.",
  click: config.cex.productUrl("SGRAGIA30708G01"),
  tags: ["video_game"],
  priority: 4,
})
  .then(() => console.log(config.ntfy.topic ? "Test push sent." : "NTFY_TOPIC not set — nothing sent."))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
