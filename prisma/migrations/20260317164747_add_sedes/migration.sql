-- AlterTable
ALTER TABLE `usr_users` ADD COLUMN `sedeId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Tbl_sedes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `serie` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Tbl_sedes_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usr_users` ADD CONSTRAINT `usr_users_sedeId_fkey` FOREIGN KEY (`sedeId`) REFERENCES `Tbl_sedes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
