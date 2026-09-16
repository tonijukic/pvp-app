CREATE TABLE "clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'pravna' NOT NULL,
	"status" text DEFAULT 'aktivna' NOT NULL,
	"area" text,
	"contract_type" text DEFAULT 'brez' NOT NULL,
	"document_number" text,
	"valid_from" date,
	"valid_to" date,
	"subject" text,
	"notes" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "clients_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "client_id" varchar;