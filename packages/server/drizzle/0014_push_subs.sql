CREATE TABLE "push_subs" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "push_subs_address" ON "push_subs" USING btree ("address");