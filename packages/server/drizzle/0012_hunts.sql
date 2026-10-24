CREATE TABLE "most_wanted" (
	"day" integer PRIMARY KEY NOT NULL,
	"chog_id" integer,
	"gang" text,
	"stole" integer DEFAULT 0 NOT NULL,
	"bounty" integer DEFAULT 0 NOT NULL,
	"claimed_by" integer,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pumpkins" (
	"id" text PRIMARY KEY NOT NULL,
	"chog_id" integer NOT NULL,
	"gang" text NOT NULL,
	"cash" integer NOT NULL,
	"gold" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
