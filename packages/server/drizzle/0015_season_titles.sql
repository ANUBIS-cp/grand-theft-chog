CREATE TABLE "season_titles" (
	"season" integer NOT NULL,
	"kind" text NOT NULL,
	"chog_id" integer NOT NULL,
	"gang" text NOT NULL,
	"amount" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_titles_season_kind_chog_id_pk" PRIMARY KEY("season","kind","chog_id")
);
--> statement-breakpoint
CREATE TABLE "seasons_closed" (
	"season" integer PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"standings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "season_titles_chog" ON "season_titles" USING btree ("chog_id");