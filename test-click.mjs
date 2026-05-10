import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on("console", msg => console.log(`BROWSER: ${msg.text()}`));
  
  await page.goto("http://localhost:3002/");
  await page.waitForTimeout(2000); // let it render
  
  console.log("Hovering welcome...");
  await page.hover("text=Welcome"); // NavChip Welcome
  await page.waitForTimeout(1000);
  
  console.log("Clicking welcome...");
  await page.click("text=Welcome");
  await page.waitForTimeout(1000);
  
  await browser.close();
}

run().catch(console.error);
