import { expect, Page } from '@playwright/test';
import { ADMIN_PASSWORD } from './env';

/** Steps several journeys share, written the way a shopper or operator would do them. */

export async function addToCart(page: Page, slug: string, options: { quantity?: number; option?: string } = {}) {
  await page.goto(`/product/${slug}`);
  const buyBox = page.getByTestId('buy-box');
  if (options.option) await buyBox.getByLabel(options.option).check();
  if (options.quantity) await buyBox.getByLabel('Quantity').fill(String(options.quantity));
  await buyBox.getByRole('button', { name: 'Add to cart' }).click();
  await expect(buyBox.getByRole('status')).toContainText('Added to your cart');
}

export async function fillAddress(page: Page, phone: string) {
  await page.getByLabel('Recipient name').fill('Ayesha Siddiqui');
  await page.getByLabel('Recipient mobile').fill(phone);
  await page.getByLabel('Province').selectOption('Punjab');
  await page.getByLabel('City').fill('Lahore');
  await page.getByLabel('House, street and block').fill('House 21, Street 7, Gulberg III');
}

export async function adminSignIn(page: Page, email: string, next = '/admin') {
  await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname.startsWith(next) && !url.pathname.startsWith('/admin/login'));
}

/** Pages are ISR-cached; on-demand revalidation lands within a second or two of the outbox tick. */
export async function eventually(page: Page, url: string, check: () => Promise<void>, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await page.goto(url);
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await page.waitForTimeout(1000);
    }
  }
}

/** The order reference from an order page URL. */
export function refFrom(url: string): string {
  const match = /\/orders\/(FK-[0-9]{6}-[0-9A-F]{6})/.exec(url);
  if (!match?.[1]) throw new Error(`No order reference in ${url}`);
  return match[1];
}
