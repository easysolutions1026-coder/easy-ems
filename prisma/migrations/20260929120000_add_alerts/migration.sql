-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "alertID" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "broadcast" BOOLEAN NOT NULL DEFAULT false,
    "projectRef" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRecipient" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "staffID" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "response" TEXT NOT NULL DEFAULT 'sent',
    "respondedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_alertID_key" ON "Alert"("alertID");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRecipient_alertId_staffID_key" ON "AlertRecipient"("alertId", "staffID");

-- AddForeignKey
ALTER TABLE "AlertRecipient" ADD CONSTRAINT "AlertRecipient_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
