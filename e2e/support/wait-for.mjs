// Waits until a URL answers 2xx. The storefront build prerenders pages from the
// API, so it must not start before the API is serving.
const url = process.argv[2];
const deadline = Date.now() + Number(process.argv[3] ?? 180_000);

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) process.exit(0);
  } catch {
    // not up yet
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.error(`Timed out waiting for ${url}`);
process.exit(1);
