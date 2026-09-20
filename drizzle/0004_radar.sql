CREATE TABLE "radar_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_key" text NOT NULL,
	"area" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"url" text,
	"summary" text,
	"published_at" date,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "radar_items_dedup_key_unique" UNIQUE("dedup_key")
);
