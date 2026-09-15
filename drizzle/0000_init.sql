CREATE TABLE "app_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "app_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "costs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" varchar NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" varchar NOT NULL,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"severity" integer DEFAULT 2 NOT NULL,
	"remind_days_before" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'odprt' NOT NULL,
	"kind" text DEFAULT 'interni' NOT NULL,
	"recurrence" text DEFAULT 'enkraten' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client" text NOT NULL,
	"title" text NOT NULL,
	"area" text DEFAULT 'drugo' NOT NULL,
	"billing_type" text DEFAULT 'po_urah' NOT NULL,
	"hourly_rate" numeric(10, 2),
	"flat_fee" numeric(10, 2),
	"status" text DEFAULT 'odprta' NOT NULL,
	"opened_at" date,
	"assigned_to" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" varchar NOT NULL,
	"user_id" varchar,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
