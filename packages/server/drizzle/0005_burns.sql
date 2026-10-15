CREATE TABLE "chog_burns" (
	"tx" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"kind" text NOT NULL,
	"chog_id" integer,
	"gang" text,
	"line" integer,
	"amount" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "chog_burns_kind_until" ON "chog_burns" USING btree ("kind","until");