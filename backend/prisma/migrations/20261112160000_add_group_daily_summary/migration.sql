-- CreateTable GroupDailySummary
CREATE TABLE IF NOT EXISTS `GroupDailySummary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GroupDailySummary_conversationId_date_idx`(`conversationId`, `date`),
    INDEX `GroupDailySummary_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `GroupDailySummary_conversationId_userId_date_key`(`conversationId`, `userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GroupDailySummary` ADD CONSTRAINT `GroupDailySummary_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupDailySummary` ADD CONSTRAINT `GroupDailySummary_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

