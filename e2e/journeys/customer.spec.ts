import { expect, test } from '@playwright/test';
import { uniquePhone } from '../support/api';
import { ADMINS, PRODUCTS } from '../support/env';
import { adminSignIn, eventually, refFrom } from '../support/flows';

/**
 * A registered customer: account, address book, wishlist, checkout with a saved
 * address, order history, and a review that goes live after moderation
 * (REQ-12/14/15/16/17).
 */
test('a customer registers, saves, buys, and reviews after moderation', async ({ page, browser }) => {
  const phone = uniquePhone();
  const reviewTitle = `Cools the lounge in minutes ${Date.now()}`;

  await page.goto('/register');
  await page.getByLabel('First name').fill('Bilal');
  await page.getByLabel('Last name').fill('Ahmed');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Password').fill('Gulberg-2026-home');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/account');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Bilal');
  await expect(page.getByRole('link', { name: 'My account' })).toBeVisible();

  // Address book (REQ-14): the first address becomes the default.
  await page.getByRole('link', { name: 'Addresses' }).click();
  await page.getByLabel('Label (optional)').fill('Home');
  await page.getByLabel('Recipient name').fill('Bilal Ahmed');
  await page.getByLabel('Mobile').fill(phone);
  await page.getByLabel('Province').selectOption('Islamabad');
  await page.getByLabel('City').fill('Islamabad');
  await page.getByLabel('House, street and block').fill('House 9, Street 14, F-7/2');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText('Default', { exact: true })).toBeVisible();

  // Wishlist (REQ-15).
  await page.goto(`/product/${PRODUCTS.gree}`);
  await page.getByTestId('buy-box').getByRole('button', { name: '♡ Save' }).click();
  await expect(page.getByTestId('buy-box').getByRole('status')).toContainText('Saved to your wishlist');
  await page.goto('/account/wishlist');
  await expect(page.getByTestId('wishlist-item')).toContainText('Gree 1 Ton Pular Inverter AC');

  // Checkout with the saved address: no contact or address form for a customer.
  await page.getByRole('link', { name: 'Gree 1 Ton Pular Inverter AC' }).click();
  await page.getByTestId('buy-box').getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByTestId('buy-box').getByRole('status')).toContainText('Added to your cart');
  await page.goto('/checkout');
  await expect(page.getByLabel('Deliver to')).toContainText('Home: Bilal Ahmed');
  await expect(page.getByLabel('Mobile number')).toHaveCount(0);
  // Islamabad is zone A; 35 kg is three bands past the first 10 kg: 350 + 3 × 150.
  await expect(page.getByTestId('delivery-fee')).toHaveText('Rs 800.00');
  await expect(page.getByTestId('checkout-total')).toHaveText('Rs 1,55,799.00');
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/orders\/FK-/);
  const ref = refFrom(page.url());

  // Order history (REQ-16), and the customer may still cancel nothing here: the order is theirs to keep.
  await page.goto('/account/orders');
  await expect(page.getByRole('link', { name: ref })).toBeVisible();

  // Review: accepted, but not shown until moderated (REQ-17).
  await page.goto(`/product/${PRODUCTS.gree}`);
  await page.getByRole('button', { name: 'Write a review' }).click();
  await page.getByLabel('4 ★').check();
  await page.getByLabel('Title (optional)').fill(reviewTitle);
  await page.getByLabel('Review (optional)').fill('Quiet at night and the inverter keeps the bill down.');
  await page.getByRole('button', { name: 'Submit review' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'once it has been checked' })).toBeVisible();
  await page.reload();
  await expect(page.getByText(reviewTitle)).toHaveCount(0);

  // Marketing approves it in the admin console.
  const ops = await browser.newContext();
  const admin = await ops.newPage();
  await adminSignIn(admin, ADMINS.marketing, '/admin/reviews');
  await admin.goto('/admin/reviews?status=PENDING');
  const row = admin.getByTestId('review-row').filter({ hasText: reviewTitle });
  await row.getByRole('button', { name: /Approve/ }).click();
  await expect(admin.getByTestId('review-row').filter({ hasText: reviewTitle })).toHaveCount(0);
  await ops.close();

  // The approval revalidates the product page (REVIEW_MODERATED → product:<slug>).
  await eventually(page, `/product/${PRODUCTS.gree}`, async () => {
    await expect(page.getByText(reviewTitle)).toBeVisible({ timeout: 1000 });
  });

  // Signing out ends the session; the account area sends us to sign in.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/');
  await page.goto('/account/orders');
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Forders/);
});

test('a returning customer signs in with a one-time code', async ({ page }) => {
  const phone = uniquePhone();
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  // NODE_ENV=test returns the code in the response (3.4 deviation 5) instead of sending an SMS.
  const hint = page.getByText(/your code is \d{6}/);
  await expect(hint).toBeVisible();
  const code = /(\d{6})/.exec((await hint.textContent()) ?? '')?.[1] ?? '';
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL('/account');
  await expect(page.getByText(/verified/)).toBeVisible();
});
