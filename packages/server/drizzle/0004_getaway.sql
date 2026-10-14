ALTER TABLE "heist_runs" ADD COLUMN "lock" text;--> statement-breakpoint
ALTER TABLE "heist_runs" ADD COLUMN "loud" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "heist_runs" ADD COLUMN "getaway" text;--> statement-breakpoint
ALTER TABLE "heist_runs" ADD COLUMN "bag_until" timestamp with time zone;