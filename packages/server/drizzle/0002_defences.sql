ALTER TABLE "gang_vaults" ADD COLUMN "guard_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gang_vaults" ADD COLUMN "guard_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gang_vaults" ADD COLUMN "guard_by" integer;