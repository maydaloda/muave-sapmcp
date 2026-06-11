CREATE TABLE "sap_systems" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text,
	"base_url" text NOT NULL,
	"sap_client" text,
	"auth_type" text NOT NULL,
	"read_only" boolean DEFAULT true NOT NULL,
	"token_url" text,
	"enc_user" text,
	"enc_password" text,
	"enc_client_id" text,
	"enc_client_secret" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
