-- AlterTable
ALTER TABLE "session" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "session" ADD COLUMN "refreshTokenExpires" DATETIME;
