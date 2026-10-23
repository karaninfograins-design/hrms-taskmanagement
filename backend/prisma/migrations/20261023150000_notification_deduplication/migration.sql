ALTER TABLE `Notification`
  ADD COLUMN `dedupeKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Notification_dedupeKey_key` ON `Notification`(`dedupeKey`);
