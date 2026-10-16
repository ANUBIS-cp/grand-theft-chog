CREATE TABLE "visits" (
	"day" integer NOT NULL,
	"who" text NOT NULL,
	"holder" boolean NOT NULL,
	"chog_id" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_day_who_pk" PRIMARY KEY("day","who")
);
