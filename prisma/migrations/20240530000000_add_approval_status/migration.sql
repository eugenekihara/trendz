-- AlterTable: Add approvalStatus column to User
-- Default 'approved' so all existing users remain active
ALTER TABLE "User" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'approved';
