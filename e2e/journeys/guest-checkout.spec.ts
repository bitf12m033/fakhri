import { expect, test } from '@playwright/test';
import { uniquePhone } from '../support/api';
import { ADMINS, PRODUCTS } from '../support/env';
import { addToCart, adminSignIn, fillAddress, refFrom } from '../support/flows';

/**
 * The core journey from 05-testing-cicd.md §1: a guest buys with a coupon and
 * cash on delivery, an operator confirms, packs and ships it, and the guest
 * tracks it to delivery (REQ-18/19/20/22/23/24/25/31).
 */
test('guest buys with a coupon, the order is fulfilled, and the guest tracks it', async ({ page, browser }) => {
  const phone = uniquePhone();

  // Cart: two 32" TVs at Rs 39,999 (5 kg each, so the first 10 kg delivery band).
  await addToCart(page, PRODUCTS.tv, { quantity: 2 });
  await expect(page.getByTestId('cart-count')).toHaveText('2');
  await page.getByRole('link', { name: 'View cart and check out' }).click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);

  // WELCOME10: 10% capped at Rs 5,000, minimum Rs 20,000.
  await page.getByLabel('Coupon code').fill('welcome10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('applied-coupon')).toHaveText('WELCOME10');
  await expect(page.getByTestId('cart-discount')).toHaveText('− Rs 5,000.00');

  await page.getByRole('link', { name: 'Proceed to checkout' }).click();
  await page.getByLabel('Mobile number').fill(phone);
  await fillAddress(page, phone);
  // Punjab is zone A: Rs 350 for the first 10 kg. 79,998 − 5,000 + 350.
  await expect(page.getByTestId('delivery-fee')).toHaveText('Rs 350.00');
  await expect(page.getByTestId('checkout-total')).toHaveText('Rs 75,348.00');
  await page.getByLabel('Cash on delivery').check();
  await page.getByRole('button', { name: 'Place order' }).click();

  await page.waitForURL(/\/orders\/FK-/);
  const ref = refFrom(page.url());
  await expect(page.getByRole('status').filter({ hasText: 'Thank you' })).toContainText(ref);
  await expect(page.getByTestId('order-total')).toHaveText('Rs 75,348.00');
  await expect(page.getByTestId('cart-count')).toHaveText('0');

  // Operator side, in a separate browser context: confirm, pack, ship, deliver.
  const ops = await browser.newContext();
  const admin = await ops.newPage();
  await adminSignIn(admin, ADMINS.orders, '/admin/orders');
  await admin.getByLabel('Reference or phone').fill(ref);
  await admin.getByRole('button', { name: 'Filter' }).click();
  await admin.getByRole('link', { name: ref }).click();
  await expect(admin.getByTestId('admin-order-ref')).toHaveText(ref);

  await admin.getByLabel('Note (optional)').fill('Confirmed by phone');
  await admin.getByRole('button', { name: 'Confirm order' }).click();
  await expect(admin.getByRole('status')).toContainText('Order is now confirmed');
  await admin.getByRole('button', { name: 'Mark packed' }).click();
  await expect(admin.getByRole('status')).toContainText('Order is now packed');

  await admin.getByLabel('Carrier').fill('TCS');
  await admin.getByLabel('Tracking code').fill(`TCS-${Date.now()}`);
  await admin.getByRole('button', { name: 'Create shipment' }).click();
  await expect(admin.getByRole('status')).toContainText('Shipment created');
  await admin.getByLabel('Tracking event').selectOption('IN_TRANSIT');
  await admin.getByRole('button', { name: 'Record event' }).click();
  await expect(admin.getByRole('status')).toContainText('Tracking event recorded');
  await expect(admin.locator('.pill').first()).toHaveText('Shipped');
  await admin.getByLabel('Tracking event').selectOption('DELIVERED');
  await admin.getByRole('button', { name: 'Record event' }).click();
  await expect(admin.locator('.pill').first()).toHaveText('Delivered');
  // Delivery collects the cash (REQ-24).
  await expect(admin.locator('.pill').nth(1)).toHaveText('Cash collected');

  // The printable invoice carries the FBR seller fields (REQ-31/40).
  await admin.getByRole('link', { name: 'Invoice' }).click();
  await expect(admin.getByRole('heading', { name: 'Sales tax invoice' })).toBeVisible();
  await expect(admin.getByText(/NTN/)).toBeVisible();
  await ops.close();

  // A guest on another device tracks it with the reference and phone (REQ-16 for guests).
  const elsewhere = await browser.newContext();
  const guest = await elsewhere.newPage();
  await guest.goto('/track');
  await guest.getByLabel('Order reference').fill(ref.toLowerCase());
  await guest.getByLabel('Mobile number used for the order').fill(phone);
  await guest.getByRole('button', { name: 'Track order' }).click();
  await expect(guest.getByTestId('order-ref')).toHaveText(`Order ${ref}`);
  const progress = guest.getByRole('list', { name: 'Order history' });
  for (const step of ['Placed', 'Confirmed', 'Packed', 'Shipped', 'Delivered']) {
    await expect(progress).toContainText(step);
  }
  await expect(guest.getByText('Confirmed by phone')).toBeVisible();

  // A wrong phone learns nothing.
  await guest.goto('/track');
  await guest.getByLabel('Order reference').fill(ref);
  await guest.getByLabel('Mobile number used for the order').fill('03000000000');
  await guest.getByRole('button', { name: 'Track order' }).click();
  await expect(guest.getByRole('alert').filter({ hasText: 'could not find an order' })).toBeVisible();
  await elsewhere.close();
});
