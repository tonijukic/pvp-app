CREATE TABLE "services" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'ura' NOT NULL,
	"price_po" numeric(10, 2),
	"price_fo" numeric(10, 2),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "services_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "pay_rate" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "service_code" text;