CREATE TABLE "gang_vaults" (
	"gang" text PRIMARY KEY NOT NULL,
	"cash" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heist_chogs" (
	"id" integer PRIMARY KEY NOT NULL,
	"gang" text,
	"jailed_until" timestamp with time zone,
	"stolen" integer DEFAULT 0 NOT NULL,
	"escapes" integer DEFAULT 0 NOT NULL,
	"busts" integer DEFAULT 0 NOT NULL,
	"catches" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "heist_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"chog_id" integer NOT NULL,
	"player" text NOT NULL,
	"gang" text NOT NULL,
	"target" text NOT NULL,
	"day" integer NOT NULL,
	"vault" text NOT NULL,
	"tier" integer NOT NULL,
	"revenge" boolean DEFAULT false NOT NULL,
	"powers" jsonb NOT NULL,
	"guards" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result" text,
	"carried" integer,
	"score" integer,
	"moved" integer,
	"caught_by" integer,
	"inputs" text
);
--> statement-breakpoint
CREATE INDEX "heist_chogs_gang" ON "heist_chogs" USING btree ("gang");--> statement-breakpoint
CREATE INDEX "heist_runs_chog_day" ON "heist_runs" USING btree ("chog_id","day");--> statement-breakpoint
CREATE INDEX "heist_runs_finished" ON "heist_runs" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "heist_runs_target" ON "heist_runs" USING btree ("target","finished_at");