CREATE TABLE "wallet_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"amount_wei" text NOT NULL,
	"nonce" integer NOT NULL,
	"last_block" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"tx" text,
	"done_at" timestamp with time zone
);
