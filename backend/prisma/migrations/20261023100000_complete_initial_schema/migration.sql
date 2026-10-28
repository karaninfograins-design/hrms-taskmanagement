-- Complete the initial schema before the subsequent leave and notification migrations.

-- Tables/columns already present are guarded to support databases previously created with db push.

CREATE TABLE IF NOT EXISTS `Department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Department_name_key`(`name`),
    UNIQUE INDEX `Department_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `EmployeeProfile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `employeeCode` VARCHAR(50) NOT NULL,
    `dob` DATETIME(3) NULL,
    `gender` VARCHAR(20) NULL,
    `address` TEXT NULL,
    `dateOfJoining` DATETIME(3) NULL,
    `employmentType` VARCHAR(50) NULL DEFAULT 'FULL_TIME',
    `employmentStatus` VARCHAR(50) NULL DEFAULT 'PERMANENT',
    `workLocation` VARCHAR(100) NULL DEFAULT 'OFFICE',
    `departmentId` INTEGER NULL,
    `reportingManagerId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmployeeProfile_userId_key`(`userId`),
    UNIQUE INDEX `EmployeeProfile_employeeCode_key`(`employeeCode`),
    INDEX `EmployeeProfile_userId_idx`(`userId`),
    INDEX `EmployeeProfile_departmentId_idx`(`departmentId`),
    INDEX `EmployeeProfile_reportingManagerId_idx`(`reportingManagerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `checkIn` DATETIME(3) NULL,
    `checkOut` DATETIME(3) NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF') NOT NULL DEFAULT 'PRESENT',
    `workingHours` DOUBLE NOT NULL DEFAULT 0,
    `remarks` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Attendance_userId_idx`(`userId`),
    INDEX `Attendance_date_idx`(`date`),
    UNIQUE INDEX `Attendance_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LeaveType` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `daysAllowed` INTEGER NOT NULL DEFAULT 12,
    `description` VARCHAR(255) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LeaveType_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LeaveBalance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,
    `allocated` INTEGER NOT NULL DEFAULT 12,
    `used` INTEGER NOT NULL DEFAULT 0,
    `remaining` INTEGER NOT NULL DEFAULT 12,
    `year` INTEGER NOT NULL DEFAULT 2026,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveBalance_userId_idx`(`userId`),
    INDEX `LeaveBalance_leaveTypeId_idx`(`leaveTypeId`),
    UNIQUE INDEX `LeaveBalance_userId_leaveTypeId_year_key`(`userId`, `leaveTypeId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LeaveRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `totalDays` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `approvedById` INTEGER NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeaveRequest_userId_idx`(`userId`),
    INDEX `LeaveRequest_leaveTypeId_idx`(`leaveTypeId`),
    INDEX `LeaveRequest_approvedById_idx`(`approvedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Meeting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `agenda` TEXT NULL,
    `roomName` VARCHAR(100) NOT NULL,
    `organizerId` INTEGER NOT NULL,
    `projectId` INTEGER NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(50) NULL DEFAULT 'UTC',
    `locationOrLink` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `status` ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Meeting_roomName_key`(`roomName`),
    INDEX `Meeting_organizerId_idx`(`organizerId`),
    INDEX `Meeting_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MeetingParticipant` (
    `meetingId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `status` ENUM('INVITED', 'ACCEPTED', 'DECLINED', 'ATTENDED') NOT NULL DEFAULT 'INVITED',

    PRIMARY KEY (`meetingId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `HRSetting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category` VARCHAR(50) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HRSetting_category_idx`(`category`),
    UNIQUE INDEX `HRSetting_category_key_key`(`category`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WorkItemAssignee` (
    `workItemId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,

    INDEX `WorkItemAssignee_workItemId_idx`(`workItemId`),
    INDEX `WorkItemAssignee_userId_idx`(`userId`),
    PRIMARY KEY (`workItemId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WorkItemActivity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workItemId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `field` VARCHAR(50) NULL,
    `oldValue` TEXT NULL,
    `newValue` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkItemActivity_workItemId_idx`(`workItemId`),
    INDEX `WorkItemActivity_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Conversation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('DIRECT', 'GROUP') NOT NULL DEFAULT 'DIRECT',
    `name` VARCHAR(150) NULL,
    `avatar` VARCHAR(255) NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Conversation_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ConversationParticipant` (
    `conversationId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReadAt` DATETIME(3) NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'MEMBER',

    INDEX `ConversationParticipant_conversationId_idx`(`conversationId`),
    INDEX `ConversationParticipant_userId_idx`(`userId`),
    PRIMARY KEY (`conversationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Message` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `senderId` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `attachmentUrl` VARCHAR(500) NULL,
    `attachmentType` VARCHAR(50) NULL,
    `replyToId` INTEGER NULL,
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Message_conversationId_idx`(`conversationId`),
    INDEX `Message_senderId_idx`(`senderId`),
    INDEX `Message_replyToId_idx`(`replyToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CallSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `channelName` VARCHAR(100) NOT NULL,
    `conversationId` INTEGER NULL,
    `hostId` INTEGER NOT NULL,
    `type` ENUM('AUDIO', 'VIDEO') NOT NULL DEFAULT 'VIDEO',
    `status` ENUM('RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'REJECTED') NOT NULL DEFAULT 'RINGING',
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CallSession_channelName_key`(`channelName`),
    INDEX `CallSession_conversationId_idx`(`conversationId`),
    INDEX `CallSession_hostId_idx`(`hostId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CallParticipant` (
    `callSessionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'INVITED',
    `joinedAt` DATETIME(3) NULL,
    `leftAt` DATETIME(3) NULL,

    INDEX `CallParticipant_callSessionId_idx`(`callSessionId`),
    INDEX `CallParticipant_userId_idx`(`userId`),
    PRIMARY KEY (`callSessionId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `link` VARCHAR(255) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CompanyHoliday` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `date` DATE NOT NULL,
    `type` VARCHAR(50) NOT NULL DEFAULT 'OFFICIAL_HOLIDAY',
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CompanyHoliday_createdById_idx`(`createdById`),
    INDEX `CompanyHoliday_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @repair_role_status = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Role' AND column_name = 'status') = 0, 'ALTER TABLE `Role` ADD COLUMN `status` BOOLEAN NOT NULL DEFAULT true', 'SELECT 1');

PREPARE repair_stmt FROM @repair_role_status;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_user_phone = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'User' AND column_name = 'phoneNumber') = 0, 'ALTER TABLE `User` ADD COLUMN `phoneNumber` VARCHAR(30) NULL', 'SELECT 1');

PREPARE repair_stmt FROM @repair_user_phone;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_project_key = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Project' AND column_name = 'key') = 0, 'ALTER TABLE `Project` ADD COLUMN `key` VARCHAR(10) NULL', 'SELECT 1');

PREPARE repair_stmt FROM @repair_project_key;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_workitem_keynumber = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'WorkItem' AND column_name = 'keyNumber') = 0, 'ALTER TABLE `WorkItem` ADD COLUMN `keyNumber` INTEGER NULL', 'SELECT 1');

PREPARE repair_stmt FROM @repair_workitem_keynumber;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_workitem_storypoints = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'WorkItem' AND column_name = 'storyPoints') = 0, 'ALTER TABLE `WorkItem` ADD COLUMN `storyPoints` VARCHAR(50) NULL', 'SELECT 1');

PREPARE repair_stmt FROM @repair_workitem_storypoints;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_comment_deletedby = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Comment' AND column_name = 'deletedById') = 0, 'ALTER TABLE `Comment` ADD COLUMN `deletedById` INTEGER NULL', 'SELECT 1');

PREPARE repair_stmt FROM @repair_comment_deletedby;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_comment_deletedat = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Comment' AND column_name = 'deletedAt') = 0, 'ALTER TABLE `Comment` ADD COLUMN `deletedAt` DATETIME(3) NULL', 'SELECT 1');

PREPARE repair_stmt FROM @repair_comment_deletedat;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_comment_deletedby_idx = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'Comment' AND index_name = 'Comment_deletedById_idx') = 0, 'CREATE INDEX `Comment_deletedById_idx` ON `Comment` (`deletedById`)', 'SELECT 1');

PREPARE repair_stmt FROM @repair_comment_deletedby_idx;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_employeeprofile_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'EmployeeProfile' AND constraint_name = 'EmployeeProfile_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `EmployeeProfile` ADD CONSTRAINT `EmployeeProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_employeeprofile_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_employeeprofile_departmentid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'EmployeeProfile' AND constraint_name = 'EmployeeProfile_departmentId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `EmployeeProfile` ADD CONSTRAINT `EmployeeProfile_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_employeeprofile_departmentid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_attendance_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Attendance' AND constraint_name = 'Attendance_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_attendance_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_leavebalance_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'LeaveBalance' AND constraint_name = 'LeaveBalance_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `LeaveBalance` ADD CONSTRAINT `LeaveBalance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_leavebalance_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_leavebalance_leavetypeid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'LeaveBalance' AND constraint_name = 'LeaveBalance_leaveTypeId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `LeaveBalance` ADD CONSTRAINT `LeaveBalance_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_leavebalance_leavetypeid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_leaverequest_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'LeaveRequest' AND constraint_name = 'LeaveRequest_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_leaverequest_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_leaverequest_leavetypeid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'LeaveRequest' AND constraint_name = 'LeaveRequest_leaveTypeId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_leaverequest_leavetypeid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_leaverequest_approvedbyid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'LeaveRequest' AND constraint_name = 'LeaveRequest_approvedById_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_leaverequest_approvedbyid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_meeting_organizerid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Meeting' AND constraint_name = 'Meeting_organizerId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_meeting_organizerid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_meeting_projectid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Meeting' AND constraint_name = 'Meeting_projectId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_meeting_projectid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_meetingparticipant_meetingid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'MeetingParticipant' AND constraint_name = 'MeetingParticipant_meetingId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `MeetingParticipant` ADD CONSTRAINT `MeetingParticipant_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_meetingparticipant_meetingid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_meetingparticipant_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'MeetingParticipant' AND constraint_name = 'MeetingParticipant_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `MeetingParticipant` ADD CONSTRAINT `MeetingParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_meetingparticipant_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_workitemassignee_workitemid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'WorkItemAssignee' AND constraint_name = 'WorkItemAssignee_workItemId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `WorkItemAssignee` ADD CONSTRAINT `WorkItemAssignee_workItemId_fkey` FOREIGN KEY (`workItemId`) REFERENCES `WorkItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_workitemassignee_workitemid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_workitemassignee_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'WorkItemAssignee' AND constraint_name = 'WorkItemAssignee_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `WorkItemAssignee` ADD CONSTRAINT `WorkItemAssignee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_workitemassignee_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_workitemactivity_workitemid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'WorkItemActivity' AND constraint_name = 'WorkItemActivity_workItemId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `WorkItemActivity` ADD CONSTRAINT `WorkItemActivity_workItemId_fkey` FOREIGN KEY (`workItemId`) REFERENCES `WorkItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_workitemactivity_workitemid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_workitemactivity_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'WorkItemActivity' AND constraint_name = 'WorkItemActivity_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `WorkItemActivity` ADD CONSTRAINT `WorkItemActivity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_workitemactivity_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_comment_deletedbyid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Comment' AND constraint_name = 'Comment_deletedById_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Comment` ADD CONSTRAINT `Comment_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_comment_deletedbyid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_conversation_createdbyid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Conversation' AND constraint_name = 'Conversation_createdById_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_conversation_createdbyid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_conversationparticipant_conversationid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'ConversationParticipant' AND constraint_name = 'ConversationParticipant_conversationId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `ConversationParticipant` ADD CONSTRAINT `ConversationParticipant_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_conversationparticipant_conversationid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_conversationparticipant_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'ConversationParticipant' AND constraint_name = 'ConversationParticipant_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `ConversationParticipant` ADD CONSTRAINT `ConversationParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_conversationparticipant_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_message_conversationid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Message' AND constraint_name = 'Message_conversationId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_message_conversationid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_message_senderid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Message' AND constraint_name = 'Message_senderId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_message_senderid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_message_replytoid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Message' AND constraint_name = 'Message_replyToId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Message` ADD CONSTRAINT `Message_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_message_replytoid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_callsession_conversationid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'CallSession' AND constraint_name = 'CallSession_conversationId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `CallSession` ADD CONSTRAINT `CallSession_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_callsession_conversationid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_callsession_hostid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'CallSession' AND constraint_name = 'CallSession_hostId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `CallSession` ADD CONSTRAINT `CallSession_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_callsession_hostid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_callparticipant_callsessionid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'CallParticipant' AND constraint_name = 'CallParticipant_callSessionId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `CallParticipant` ADD CONSTRAINT `CallParticipant_callSessionId_fkey` FOREIGN KEY (`callSessionId`) REFERENCES `CallSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_callparticipant_callsessionid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_callparticipant_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'CallParticipant' AND constraint_name = 'CallParticipant_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `CallParticipant` ADD CONSTRAINT `CallParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_callparticipant_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_notification_userid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'Notification' AND constraint_name = 'Notification_userId_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_notification_userid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;

SET @repair_companyholiday_createdbyid_fkey = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'CompanyHoliday' AND constraint_name = 'CompanyHoliday_createdById_fkey' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE `CompanyHoliday` ADD CONSTRAINT `CompanyHoliday_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');

PREPARE repair_stmt FROM @repair_companyholiday_createdbyid_fkey;

EXECUTE repair_stmt;

DEALLOCATE PREPARE repair_stmt;
