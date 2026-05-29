-- AlterTable: Add ON DELETE CASCADE to SaleItem->Sale foreign key
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate the table

PRAGMA foreign_keys=OFF;

CREATE TABLE `SaleItem_new` (
    `id` TEXT NOT NULL PRIMARY KEY,
    `saleId` TEXT NOT NULL,
    `productId` TEXT NOT NULL,
    `quantity` INTEGER NOT NULL,
    `price` REAL NOT NULL,
    `total` REAL NOT NULL,
    FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
);

INSERT INTO `SaleItem_new` (`id`, `saleId`, `productId`, `quantity`, `price`, `total`)
SELECT `id`, `saleId`, `productId`, `quantity`, `price`, `total` FROM `SaleItem`;

DROP TABLE `SaleItem`;

ALTER TABLE `SaleItem_new` RENAME TO `SaleItem`;

PRAGMA foreign_keys=ON;
