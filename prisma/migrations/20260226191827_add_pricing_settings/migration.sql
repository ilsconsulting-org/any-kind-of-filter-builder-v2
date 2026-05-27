-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "discountFactor" REAL NOT NULL DEFAULT 0.61,
    "subscriptionDiscount" REAL,
    "updatedAt" DATETIME NOT NULL
);
