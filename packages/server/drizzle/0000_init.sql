CREATE SEQUENCE "public"."crew_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chog_states" (
	"id" integer PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"gang" text,
	"cash" integer NOT NULL,
	"xp" integer NOT NULL,
	"active" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" text PRIMARY KEY NOT NULL,
	"day" integer NOT NULL,
	"offer_key" text NOT NULL,
	"leader_id" integer NOT NULL,
	"slots" jsonb NOT NULL,
	"jailbreak_target" integer,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "days" (
	"day" integer PRIMARY KEY NOT NULL,
	"seed" text NOT NULL,
	"commitment" text NOT NULL,
	"holders" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"commit_tx" text,
	"reveal_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delegations" (
	"owner" text NOT NULL,
	"player" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegations_owner_player_pk" PRIMARY KEY("owner","player")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"chog_id" integer NOT NULL,
	"target" integer,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"token_id" integer PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"block" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chog_states_cash" ON "chog_states" USING btree ("cash");--> statement-breakpoint
CREATE INDEX "chog_states_gang" ON "chog_states" USING btree ("gang");--> statement-breakpoint
CREATE INDEX "crews_day_status" ON "crews" USING btree ("day","status");--> statement-breakpoint
CREATE INDEX "delegations_player" ON "delegations" USING btree ("player");--> statement-breakpoint
CREATE INDEX "events_day_type" ON "events" USING btree ("day","type");--> statement-breakpoint
CREATE INDEX "events_chog" ON "events" USING btree ("chog_id");--> statement-breakpoint
CREATE INDEX "events_target" ON "events" USING btree ("target");--> statement-breakpoint
CREATE INDEX "owners_owner" ON "owners" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "sessions_address" ON "sessions" USING btree ("address");