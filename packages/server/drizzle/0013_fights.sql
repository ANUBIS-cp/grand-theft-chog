CREATE TABLE "fight_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"chog_id" integer NOT NULL,
	"player" text NOT NULL,
	"gang" text NOT NULL,
	"day" integer NOT NULL,
	"slot" integer NOT NULL,
	"opponent" integer NOT NULL,
	"seed" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"won" boolean,
	"paid" integer,
	"inputs" text
);
--> statement-breakpoint
CREATE INDEX "fight_runs_chog_day" ON "fight_runs" USING btree ("chog_id","day");--> statement-breakpoint
CREATE INDEX "fight_runs_finished" ON "fight_runs" USING btree ("finished_at");