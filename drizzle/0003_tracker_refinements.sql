ALTER TABLE "matters" ADD COLUMN "waiting_reason" text;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "waiting_note" text;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "pausal_package_code" text;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "included_hours" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "reduced_rate" numeric(10, 2);--> statement-breakpoint
CREATE TABLE "matter_agreements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" varchar NOT NULL,
	"agreement_type" text NOT NULL,
	"document_number" text,
	"valid_from" date,
	"valid_to" date,
	"note" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pausal_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"included_hours" numeric(6, 2) NOT NULL,
	"reduced_rate" numeric(10, 2),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "pausal_packages_code_unique" UNIQUE("code")
);
