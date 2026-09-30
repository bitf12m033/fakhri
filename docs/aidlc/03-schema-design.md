# AIDLC — Phase 2b: Data / Schema Design v0 (Prisma)

Implements DEC-02 (hybrid typed EAV), DEC-05 (no float money), single-warehouse inventory (Q-10),
outbox (DEC-04). Status: **PROPOSAL** — approval required before migration is generated.

Conventions:
- IDs: `String @id @default(cuid())` (opaque, no enumeration). Human refs (order refs, SKUs) are separate `@unique` business keys.
- Money: `Decimal @db.Decimal(12,2)` (exact; code uses decimal.js — never JS float). Implementation detail of DEC-05.
- Every table: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Soft deletes avoided; statuses + audit/ledger used instead. All admin mutations → `AuditLog`.
- `Json?` used only for SEO payloads, complex spec values (escape hatch), and bounded metadata.

## 1. Enums

```prisma
enum AttributeType  { TEXT NUMBER BOOLEAN OPTION JSON }
enum ProductStatus  { DRAFT ACTIVE ARCHIVED }
enum OrderStatus    { PENDING CONFIRMED PACKED SHIPPED DELIVERED CANCELLED RETURNED }
enum PaymentStatus  { PENDING SUCCEEDED FAILED PENDING_COLLECTION COLLECTED REFUNDED }
enum PaymentMethod  { COD BANK_TRANSFER CARD JAZZCASH EASYPAISA }
enum DeliveryType   { HOME_DELIVERY STORE_PICKUP }
enum StockMovementType { RECEIPT SALE RESERVATION RESERVATION_RELEASE
                         TRANSFER_OUT TRANSFER_IN ADJUSTMENT_IN ADJUSTMENT_OUT }
enum TransferStatus { PENDING IN_TRANSIT COMPLETED CANCELLED }
enum CouponType     { FIXED PERCENT FREE_SHIPPING }
enum CouponApplies  { ALL CATEGORY BRAND PRODUCT }
enum UserRole       { SUPER_ADMIN CATALOG INVENTORY ORDERS MARKETING SUPPORT }
enum ReviewStatus   { PENDING APPROVED REJECTED }
enum OutboxStatus   { PENDING PUBLISHED FAILED }
enum ShipmentStatus { PENDING PICKUP_SCHEDULED IN_TRANSIT DELIVERED FAILED RETURNED }
```

## 2. Catalog (hybrid EAV core)

```prisma
model Category {
  id               String            @id @default(cuid())
  parentId         String?
  parent           Category?         @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Restrict)
  children         Category[]        @relation("CategoryTree")
  slug             String            @unique
  name             String
  description      String?
  iconUrl          String?
  sortOrder        Int               @default(0)
  isActive         Boolean           @default(true)
  seo              Json?             // { title?, description?, keywords[] }
  categoryAttributes CategoryAttribute[]
  products         Product[]
}

model Brand {
  id           String     @id @default(cuid())
  slug         String     @unique
  name         String
  description  String?
  logoUrl      String?
  coverUrl     String?
  isActive     Boolean    @default(true)
  seo          Json?
  products     Product[]
}

model Attribute {
  id             String            @id @default(cuid())
  slug           String            @unique    // stable machine key, e.g. "cooling-capacity-btu"
  name           String                       // display, e.g. "Cooling Capacity"
  description    String?
  type           AttributeType
  unit           String?                      // tons, BTU/hr, inches, L, W, kWh/yr
  validation     Json?                        // OPTION→{}, NUMBER→{min,max,step}, TEXT→{pattern,maxLength}
  isSearchable   Boolean           @default(true)   // included in search index blob
  isComparable   Boolean           @default(true)
  options        AttributeOption[]
  categoryAttributes CategoryAttribute[]
  values         ProductAttributeValue[]
}

model AttributeOption {
  id          String     @id @default(cuid())
  attributeId String
  attribute   Attribute  @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  value       String     @unique   // normalized slug-ish value, e.g. "inverter"
  label       String               // display, e.g. "Inverter"
  sortOrder   Int        @default(0)
  @@unique([attributeId, value])
}

// category ↔ attribute template binding → drives PLP filters + product form + compare columns
model CategoryAttribute {
  categoryId    String
  attributeId   String
  group        String?   // filter group label, e.g. "Cooling"
  sortOrder    Int       @default(0)
  isRequired   Boolean   @default(false)
  isFilterable Boolean   @default(false)
  isComparable Boolean   @default(true)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  attribute Attribute @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  @@id([categoryId, attributeId])
}

model Product {
  id              String                 @id @default(cuid())
  slug            String                 @unique
  brandId         String
  brand           Brand                  @relation(fields: [brandId], references: [id], onDelete: Restrict)
  categoryId      String
  category        Category               @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  name            String
  shortDescription String?
  description     String?
  warrantyInfo    String?
  tags            String[]
  status          ProductStatus          @default(DRAFT)
  isFeatured      Boolean                @default(false)
  publishedAt     DateTime?
  seo             Json?
  variants        ProductVariant[]
  attributeValues ProductAttributeValue[]
  images          ProductImage[]
  reviews         Review[]
  @@index([brandId]) @@index([categoryId]) @@index([status])
}

model ProductImage {
  id        String    @id @default(cuid())
  productId String
  variantId String?   // null ⇒ product-level gallery image
  url       String
  alt       String?
  sortOrder Int       @default(0)
  isPrimary Boolean   @default(false)
  product   Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@index([productId])
}

// ATTRIBUTE VALUES — the hybrid heart.
// Exactly one of optionValueId | numberValue | booleanValue | textValue | jsonValue must be set
// (CHECK constraint added in migration). Row is product-scoped (variantId=null) or variant-scoped (productId=null).
model ProductAttributeValue {
  id             String            @id @default(cuid())
  productId      String?
  product        Product?          @relation(fields: [productId], references: [id], onDelete: Cascade)
  variantId      String?           // variant-shaping specs (e.g. colour) resolve here
  variant        ProductVariant?   @relation(fields: [variantId], references: [id], onDelete: Cascade)
  attributeId    String
  attribute      Attribute         @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  optionValueId  String?
  optionValue    AttributeOption?  @relation(fields: [optionValueId], references: [id], onDelete: Restrict)
  numberValue    Decimal?          @db.Decimal(12,3)
  booleanValue   Boolean?
  textValue      String?
  jsonValue      Json?
  @@unique([productId, attributeId])
  @@unique([variantId, attributeId])
  @@index([attributeId, optionValueId])   // facet counts
  @@index([attributeId, numberValue])     // numeric range filters
}

model ProductVariant {
  id                  String      @id @default(cuid())
  productId           String
  product             Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  sku                 String      @unique
  barcode             String?     @unique
  name                String?     // variant label, e.g. "Rose Gold"
  price               Decimal     @db.Decimal(12,2)
  compareAtPrice      Decimal?    @db.Decimal(12,2)   // strike-through (ASM-04)
  costPrice           Decimal?    @db.Decimal(12,2)   // margin reporting only; never exposed
  weightKg            Decimal?    @db.Decimal(8,3)
  heightCm            Decimal?    @db.Decimal(7,2)
  widthCm             Decimal?    @db.Decimal(7,2)
  depthCm             Decimal?    @db.Decimal(7,2)
  isActive            Boolean     @default(true)
  isAvailableOnOrder  Boolean     @default(false)
  attributeValues     ProductAttributeValue[]
  inventoryItems      InventoryItem[]
  stockLedger         StockLedger[]
  cartItems           CartItem[]
  orderItems          OrderItem[]
  wishlistItems       WishlistItem[]
  @@index([productId]) @@index([isActive])
}
```

## 3. Inventory (single main warehouse at MVP, model ready for N)

```prisma
model Warehouse {
  id        String  @id @default(cuid())
  code      String  @unique
  name      String
  address   String
  city      String
  phone     String?
  isActive  Boolean @default(true)
  items     InventoryItem[]
  ledger    StockLedger[]
}

model InventoryItem {            // single source of truth balance
  id          String    @id @default(cuid())
  warehouseId String
  variantId   String
  onHand      Int       @default(0)      // physical
  reserved    Int       @default(0)      // held by orders
  variant     ProductVariant @relation(fields:[variantId], references:[id], onDelete: Cascade)
  warehouse   Warehouse       @relation(fields:[warehouseId], references:[id], onDelete: Cascade)
  @@unique([warehouseId, variantId])
} // available = onHand - reserved (computed; materialized in reads, guarded in writes)

model StockLedger {            // immutable, append-only
  id          String            @id @default(cuid())
  variantId   String
  warehouseId String
  quantity    Int               // signed
  type        StockMovementType
  refType     String?           // ORDER, ADJUSTMENT, TRANSFER, RECEIPT
  refId       String?           // orderId / adjustmentId / transferId
  note        String?
  actorId     String?           // userId for admin ops
  createdAt   DateTime          @default(now())
  @@index([variantId, createdAt])
}

model StockAdjustment {
  id          String  @id @default(cuid())
  warehouseId String
  variantId   String
  quantity    Int               // signed delta; final onHand must stay ≥ 0
  reason      String
  approvedBy  String?           // user id
  note        String?
  createdAt   DateTime          @default(now())
}

model StockTransfer {
  id              String          @id @default(cuid())
  refNumber       String          @unique
  fromWarehouseId String
  toWarehouseId   String
  status          TransferStatus  @default(PENDING)
  items           StockTransferItem[]
  createdAt       DateTime        @default(now())
}
model StockTransferItem {
  id          String @id @default(cuid())
  transferId  String
  variantId   String
  quantity    Int
  transfer    StockTransfer @relation(fields:[transferId], references:[id], onDelete: Cascade)
}
// Reservation is NOT a separate table: `reserved` on InventoryItem ± ledger rows (RESERVATION).
// Order cancellation → RESERVATION_RELEASE; delivery → SALE (reserved→onHand decrement).
```

## 4. Customers, Auth, Reviews

```prisma
model Customer {
  id              String     @id @default(cuid())
  phone           String     @unique
  email           String?    @unique
  passwordHash    String?
  firstName       String?
  lastName        String?
  isPhoneVerified Boolean    @default(false)
  status          String     @default("ACTIVE")        // ACTIVE | DISABLED
  whatsappConsent Boolean    @default(false)
  lastLoginAt     DateTime?
  addresses       CustomerAddress[]
  wishlistItems   WishlistItem[]
  orders          Order[]
  reviews         Review[]
}

model OtpCode {
  id         String    @id @default(cuid())
  phone      String
  codeHash   String    // argon2id hash, never plaintext
  purpose    String    // LOGIN | VERIFY_PHONE
  attempts   Int       @default(0)
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())
  @@index([phone, purpose, createdAt])
}

model CustomerAddress {
  id            String    @id @default(cuid())
  customerId    String
  label         String?   // Home / Office
  recipientName String
  phone         String
  province      String
  city          String
  area          String?
  addressLine   String
  landmark      String?
  mapPin        Json?     // {lat?, lng?} optional geo
  isDefault     Boolean   @default(false)
  customer      Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
}

model WishlistItem {
  id         String   @id @default(cuid())
  customerId String
  variantId  String
  customer   Customer @relation(fields:[customerId], references:[id], onDelete: Cascade)
  variant    ProductVariant @relation(fields:[variantId], references:[id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  @@unique([customerId, variantId])
}

model Review {
  id            String       @id @default(cuid())
  customerId    String
  productId     String
  rating        Int          @db.SmallInt      // 1..5 (CHECK)
  title         String?
  body          String?
  images        Json?        // [{url, sortOrder}] (limited; validated uploads)
  status        ReviewStatus @default(PENDING)
  isVerifiedPurchase Boolean @default(false)
  createdAt     DateTime     @default(now())
  customer      Customer     @relation(fields:[customerId], references:[id], onDelete: Restrict)
  product       Product      @relation(fields:[productId], references:[id], onDelete: Cascade)
  @@unique([customerId, productId])
  @@index([productId, status])
}

model AdminUser {
  id            String     @id @default(cuid())
  name          String
  email         String     @unique
  passwordHash  String
  role          UserRole
  isActive      Boolean    @default(true)
  lastLoginAt   DateTime?
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id         String      @id @default(cuid())
  userId     String
  tokenHash  String      @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  replacedByTokenId String?
  userAgent  String?
  ip         String?
  createdAt  DateTime    @default(now())
  user       AdminUser   @relation(fields:[userId], references:[id], onDelete: Cascade)
}
```

## 5. Cart, Checkout, Orders, Payments, Shipments

```prisma
model Cart {
  id          String      @id @default(cuid())
  token       String?     @unique            // guest cart token (cookie)
  customerId  String?
  couponId    String?
  status      String      @default("OPEN")   // OPEN | CONVERTED | ABANDONED
  items       CartItem[]
  createdAt   DateTime    @default(now())
  expiresAt   DateTime?
}

model CartItem {
  id        String  @id @default(cuid())
  cartId    String
  variantId String
  quantity  Int                                     // CHECK >= 1
  cart      Cart    @relation(fields:[cartId], references:[id], onDelete: Cascade)
  variant   ProductVariant @relation(fields:[variantId], references:[id], onDelete: Restrict)
  @@unique([cartId, variantId])
}

model Order {
  id                String        @id @default(cuid())
  refNumber         String        @unique           // e.g. "FK-2026-000123"
  customerId        String?
  guestEmail        String?
  guestPhone        String?
  deliveryType      DeliveryType
  addressSnapshot   Json?                             // denormalized copy at order time
  couponId          String?
  status            OrderStatus   @default(PENDING)
  paymentStatus     PaymentStatus @default(PENDING)
  itemsTotal        Decimal       @db.Decimal(12,2)
  discountTotal     Decimal       @db.Decimal(12,2) @default(0)
  deliveryFee       Decimal       @db.Decimal(12,2) @default(0)
  taxTotal          Decimal       @db.Decimal(12,2) @default(0)
  grandTotal        Decimal       @db.Decimal(12,2)
  customerNote      String?
  internalNote      String?
  codConfirmation   Boolean       @default(false)      // support call done (COD risk check)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  customer          Customer?     @relation(fields:[customerId], references:[id])
  items             OrderItem[]
  history           OrderStatusHistory[]
  payments          Payment[]
  shipment          Shipment?
  @@index([status]) @@index([customerId]) @@index([createdAt])
}

model OrderItem {
  id          String  @id @default(cuid())
  orderId     String
  variantId   String
  sku         String
  productName String
  variantName String?
  quantity    Int
  unitPrice   Decimal @db.Decimal(12,2)
  subtotal    Decimal @db.Decimal(12,2)
  order       Order       @relation(fields:[orderId], references:[id], onDelete: Cascade)
}

model OrderStatusHistory {
  id         String     @id @default(cuid())
  orderId    String
  status     OrderStatus
  note       String?
  actorType  String     // ADMIN | CUSTOMER | SYSTEM
  actorId    String?
  createdAt  DateTime   @default(now())
  order      Order      @relation(fields:[orderId], references:[id], onDelete: Cascade)
}

// PAYMENT LEDGER — one row per payment attempt/method on an order; immutable; voiding via new rows
model Payment {
  id          String          @id @default(cuid())
  orderId     String
  method      PaymentMethod
  amount      Decimal         @db.Decimal(12,2)   // amount in this method (may split)
  status      PaymentStatus   @default(PENDING)
  gateway     String?                             // JAZZCASH | EASYPAISA | CARD | null(COD/BT)
  gatewayRef  String?
  paidAt      DateTime?
  meta        Json?                               // gateway raw response (sanitized)
  createdAt   DateTime        @default(now())
  order       Order           @relation(fields:[orderId], references:[id], onDelete: Restrict)
  refunds     Refund[]
  @@unique([gateway, gatewayRef])                 // idempotency: gateway callback replay
}

model Refund {                                     // FR-31 placeholder (future active flow)
  id        String    @id @default(cuid())
  paymentId String
  amount    Decimal   @db.Decimal(12,2)
  reason    String?
  status    String    @default("PENDING")
  createdAt DateTime  @default(now())
  payment   Payment   @relation(fields:[paymentId], references:[id], onDelete: Restrict)
}

model Shipment {
  id            String          @id @default(cuid())
  orderId       String          @unique
  carrier       String?         // "internal" | future courier adapter code
  trackingCode  String?
  status        ShipmentStatus  @default(PENDING)
  labelUrl      String?
  events        ShipmentEvent[]
  order         Order           @relation(fields:[orderId], references:[id])
  createdAt     DateTime        @default(now())
}
model ShipmentEvent {
  id         String    @id @default(cuid())
  shipmentId String
  status     ShipmentStatus
  location   String?
  note       String?
  createdAt  DateTime  @default(now())
  shipment   Shipment  @relation(fields:[shipmentId], references:[id], onDelete: Cascade)
}
```

## 6. Marketing, Content, Cross-cutting

```prisma
model Coupon {
  id               String        @id @default(cuid())
  code             String        @unique
  type             CouponType
  value            Decimal       @db.Decimal(12,2)   // FIXED: amount; PERCENT: percent
  maxDiscount      Decimal?      @db.Decimal(12,2)   // PERCENT cap
  minOrderValue    Decimal?      @db.Decimal(12,2)
  usageLimit       Int?
  perCustomerLimit Int?
  appliesTo        CouponApplies @default(ALL)
  appliesIds       String[]                           // category/brand/product ids
  validFrom        DateTime
  validTo          DateTime?
  isActive         Boolean       @default(true)
  createdAt        DateTime      @default(now())
  usages           CouponUsage[]
}

model CouponUsage {
  id         String   @id @default(cuid())
  couponId   String
  orderId    String   @unique
  customerId String?
  discount   Decimal  @db.Decimal(12,2)
  createdAt  DateTime @default(now())
  coupon     Coupon   @relation(fields:[couponId], references:[id], onDelete: Restrict)
}

model ContentPage {
  id           String    @id @default(cuid())
  slug         String    @unique
  title        String
  body         String            // sanitized HTML
  seo          Json?
  isPublished  Boolean   @default(false)
  publishedAt  DateTime?
  createdAt    DateTime  @default(now())
}

model Banner {
  id        String    @id @default(cuid())
  title     String?
  imageUrl  String
  linkUrl   String?             // internal slug or external URL
  position  String              // PLP_TOP, PDP_TOP, HERO...
  sortOrder Int       @default(0)
  isActive  Boolean   @default(true)
  startsAt  DateTime?
  endsAt    DateTime?
}

model AuditLog {                  // immutable; written within the mutating transaction
  id           String   @id @default(cuid())
  actorType    String   // ADMIN | CUSTOMER | SYSTEM
  actorId      String?
  action       String   // CREATE | UPDATE | DELETE | STATUS_CHANGE | LOGIN_* ...
  entityType   String   // Product, Order, Coupon...
  entityId     String
  before       Json?
  after        Json?
  ip           String?
  userAgent    String?
  createdAt    DateTime @default(now())
  @@index([entityType, entityId]) @@index([createdAt])
}

model OutboxEvent {               // transactional outbox → dispatched to queues
  id            String        @id @default(cuid())
  type          String        // ORDER_CREATED, ORDER_STATUS_CHANGED, PAYMENT_SUCCEEDED, STOCK_MUTATED...
  aggregateType String
  aggregateId   String
  payload       Json
  status        OutboxStatus  @default(PENDING)
  attemptCount  Int           @default(0)
  lastError     String?
  createdAt     DateTime      @default(now())
  publishedAt   DateTime?
  @@index([status, createdAt])
}
```

## 7. Integrity rules (enforced at DB + service layer)

1. **ProductAttributeValue**: CHECK `(exactly one typed column set)` and `(productId=null XOR variantId=null)`;
   variant-scoped attribute must be OPTION type and a *variant-shaping* flag (attribute use flag added in 2d).
2. **Money**: totals = items − discount + delivery + tax, recomputed and verified server-side at cart & order.
3. **Inventory**: `available = onHand − reserved ≥ 0`; reservation via `UPDATE ... WHERE onHand - reserved >= qty`
   (per-statement atomicity inside an order transaction, `SELECT ... FOR UPDATE` on Cart/Order row for idempotency).
4. **Cart** pricing snapshots: unitPrice copied from variant at add time, revalidated at checkout (price-change notice).
5. **Ledgers are append-only**: no UPDATE/DELETE on StockLedger / AuditLog / OrderStatusHistory / Payment rows.
6. **Discount caps**: PERCENT coupon never exceeds maxDiscount; discount never below 0 AFTER tax-line consistency.
7. **Reviews**: one per (customer, product); only customers with a DELIVERED order for that product get verified badge.

## 8. Indexes & search support

- `pg_trgm` GIN on `Product`.`name` and a generated `search_document` (title + brand name + attribute labels/values).
- Facet support indexes: `ProductAttributeValue[attributeId, optionValueId]`, `[attributeId, numberValue]`.
- All list endpoints force pagination (`offset/limit` or cursor) — no unbounded reads (REQ-38).

## 9. Open design notes (resolved in 2d/implementation)

- Postgres CHECK constraints for (1)(3)(7) must be added in the first migration (Prisma doesn't express CHECKs).
- Variant-shaping attribute flag: add `isVariantDefining Boolean` to `Attribute` if multi-axis variants needed; MVP allows single-axis (color) via ProductVariant.attributeValues.
- Money formatting/rounding utility shared in `packages/shared`.

## 10. Approval gate (Phase 2b)
Approve schema v0 (or annotate changes). It becomes the Prisma `schema.prisma` in increment-0; CHECK constraints
carried into the first migration as raw SQL.